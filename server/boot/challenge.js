import _ from 'lodash';
import debug from 'debug';
import accepts from 'accepts';
import dedent from 'dedent';

import { ifNoUserSend } from '../utils/middleware';
import { getChallengeById, cachedMap } from '../utils/map';
import { dasherize } from '../utils';

import pathMigrations from '../resources/pathMigration.json';

const log = debug('fcc:boot:challenges');

const learnURL = 'https://learn.freecodecamp.org';

function buildUserUpdate(
  user,
  challengeId,
  completedChallenge,
  timezone
) {
  let finalChallenge;
  const updateData = { $set: {}, $push: {} };
  const { timezone: userTimezone, completedChallenges = [] } = user;

  const oldChallenge = _.find(
    completedChallenges,
    ({ id }) => challengeId === id
  );
  const alreadyCompleted = !!oldChallenge;

  if (alreadyCompleted) {
    finalChallenge = {
      ...completedChallenge,
      completedDate: oldChallenge.completedDate
    };
  } else {
    updateData.$push = {
      ...updateData.$push,
      progressTimestamps: Date.now()
    };
    finalChallenge = {
      ...completedChallenge
    };
  }

  updateData.$push = {
    ...updateData.$push,
    completedChallenges: finalChallenge
  };

  if (
    timezone &&
    timezone !== 'UTC' &&
    (!userTimezone || userTimezone === 'UTC')
  ) {
    updateData.$set = {
      ...updateData.$set,
      timezone: userTimezone
    };
  }

  log('user update data', updateData);

  return {
    alreadyCompleted,
    updateData,
    completedDate: finalChallenge.completedDate
  };
}

export default function(app) {
  const send200toNonUser = ifNoUserSend(true);
  const api = app.loopback.Router();
  const router = app.loopback.Router();
  const map = cachedMap(app.models);

  api.post(
    '/modern-challenge-completed',
    send200toNonUser,
    modernChallengeCompleted
  );

  // deprecate endpoint
  // remove once new endpoint is live
  api.post(
    '/completed-challenge',
    send200toNonUser,
    completedChallenge
  );

  api.post(
    '/challenge-completed',
    send200toNonUser,
    completedChallenge
  );

  // deprecate endpoint
  // remove once new endpoint is live
  api.post(
    '/completed-zipline-or-basejump',
    send200toNonUser,
    projectCompleted
  );

  api.post(
    '/project-completed',
    send200toNonUser,
    projectCompleted
  );

  api.post(
    '/backend-challenge-completed',
    send200toNonUser,
    backendChallengeCompleted
  );

  router.get(
    '/challenges/current-challenge',
    redirectToCurrentChallenge
  );

  router.get('/challenges', redirectToLearn);

  router.get('/challenges/*', redirectToLearn);

  router.get('/map', redirectToLearn);

  app.use(api);
  app.use(router);

  function modernChallengeCompleted(req, res, next) {
    const type = accepts(req).type('html', 'json', 'text');
    req.checkBody('id', 'id must be an ObjectId').isMongoId();
    req.checkBody('files', 'files must be an object with polyvinyls for keys')
      .isFiles();

    const errors = req.validationErrors(true);
    if (errors) {
      if (type === 'json') {
        return res.status(403).send({ errors });
      }

      log('errors', errors);
      return res.sendStatus(403);
    }

    const user = req.user;
    return user.getCompletedChallenges$()
      .flatMap(() => {
        const completedDate = Date.now();
        const {
          id,
          files
        } = req.body;

        const {
          alreadyCompleted,
          updateData
        } = buildUserUpdate(
          user,
          id,
          { id, files, completedDate }
        );

        const points = alreadyCompleted ? user.points : user.points + 1;

        return user.update$(updateData)
          .doOnNext(({ count }) => log('%s documents updated', count))
          .map(() => {
            if (type === 'json') {
              return res.json({
                points,
                alreadyCompleted,
                completedDate
              });
            }
            return res.sendStatus(200);
          });
      })
      .subscribe(() => {}, next);
  }

  function completedChallenge(req, res, next) {
    req.checkBody('id', 'id must be an ObjectId').isMongoId();
    const type = accepts(req).type('html', 'json', 'text');
    const errors = req.validationErrors(true);

    if (errors) {
      if (type === 'json') {
        return res.status(403).send({ errors });
      }

      log('errors', errors);
      return res.sendStatus(403);
    }

    return req.user.getCompletedChallenges$()
      .flatMap(() => {
        const completedDate = Date.now();
        const { id, solution, timezone } = req.body;

        const {
          alreadyCompleted,
          updateData
        } = buildUserUpdate(
          req.user,
          id,
          { id, solution, completedDate },
          timezone
        );

        const user = req.user;
        const points = alreadyCompleted ? user.points : user.points + 1;

        return user.update$(updateData)
          .doOnNext(({ count }) => log('%s documents updated', count))
          .map(() => {
            if (type === 'json') {
              return res.json({
                points,
                alreadyCompleted,
                completedDate
              });
            }
            return res.sendStatus(200);
          });
      })
      .subscribe(() => {}, next);
  }

  function projectCompleted(req, res, next) {
    const type = accepts(req).type('html', 'json', 'text');
    req.checkBody('id', 'id must be an ObjectId').isMongoId();
    req.checkBody('challengeType', 'must be a number').isNumber();
    req.checkBody('solution', 'solution must be a URL').isURL();

    const errors = req.validationErrors(true);

    if (errors) {
      if (type === 'json') {
        return res.status(403).send({ errors });
      }
      log('errors', errors);
      return res.sendStatus(403);
    }

    const { user, body = {} } = req;

    const completedChallenge = _.pick(
      body,
      [ 'id', 'solution', 'githubLink', 'challengeType' ]
    );
    completedChallenge.completedDate = Date.now();

    if (
      !completedChallenge.solution ||
      // only basejumps require github links
      (
        completedChallenge.challengeType === 4 &&
        !completedChallenge.githubLink
      )
    ) {
      req.flash(
        'danger',
        'You haven\'t supplied the necessary URLs for us to inspect your work.'
      );
      return res.sendStatus(403);
    }


    return user.getCompletedChallenges$()
      .flatMap(() => {
        const {
          alreadyCompleted,
          updateData
        } = buildUserUpdate(user, completedChallenge.id, completedChallenge);

        return user.update$(updateData)
          .doOnNext(({ count }) => log('%s documents updated', count))
          .doOnNext(() => {
            if (type === 'json') {
              return res.send({
                alreadyCompleted,
                points: alreadyCompleted ? user.points : user.points + 1,
                completedDate: completedChallenge.completedDate
              });
            }
            return res.status(200).send(true);
          });
      })
      .subscribe(() => {}, next);
  }

  function backendChallengeCompleted(req, res, next) {
    const type = accepts(req).type('html', 'json', 'text');
    req.checkBody('id', 'id must be an ObjectId').isMongoId();
    req.checkBody('solution', 'solution must be a URL').isURL();

    const errors = req.validationErrors(true);

    if (errors) {
      if (type === 'json') {
        return res.status(403).send({ errors });
      }
      log('errors', errors);
      return res.sendStatus(403);
    }

    const { user, body = {} } = req;

    const completedChallenge = _.pick(
      body,
      [ 'id', 'solution' ]
    );
    completedChallenge.completedDate = Date.now();


    return user.getCompletedChallenges$()
      .flatMap(() => {
        const {
          alreadyCompleted,
          updateData
        } = buildUserUpdate(user, completedChallenge.id, completedChallenge);

        return user.update$(updateData)
          .doOnNext(({ count }) => log('%s documents updated', count))
          .doOnNext(() => {
            if (type === 'json') {
              return res.send({
                alreadyCompleted,
                points: alreadyCompleted ? user.points : user.points + 1,
                completedDate: completedChallenge.completedDate
              });
            }
            return res.status(200).send(true);
          });
      })
      .subscribe(() => {}, next);
  }

  function redirectToCurrentChallenge(req, res, next) {
    const { user } = req;
    const challengeId = user && user.currentChallengeId;
    return getChallengeById(map, challengeId)
      .map(challenge => {
        const { block, dashedName, superBlock } = challenge;
        if (!dashedName || !block) {
          // this should normally not be hit if database is properly seeded
          throw new Error(dedent`
            Attempted to find '${dashedName}'
            from '${ challengeId || 'no challenge id found'}'
            but came up empty.
            db may not be properly seeded.
          `);
        }
        return `${learnURL}/${dasherize(superBlock)}/${block}/${dashedName}`;
      })
      .subscribe(
        redirect => res.redirect(redirect || learnURL),
        next
      );
  }

  function redirectToLearn(req, res) {
    const maybeChallenge = _.last(req.path.split('/'));
    if (maybeChallenge in pathMigrations) {
      const redirectPath = pathMigrations[maybeChallenge];
      return res.status(302).redirect(`${learnURL}${redirectPath}`);
    }
    return res.status(302).redirect(learnURL);
  }
}
