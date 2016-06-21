import { Observable } from 'rx';
import types from './types';
import { showChallengeComplete, moveToNextChallenge } from './actions';
import {
  createErrorObservable,
  makeToast,
  updateUserPoints
} from '../../../redux/actions';

import { challengeSelector } from './selectors';
import { backEndProject } from '../../../utils/challengeTypes';
import { randomCompliment } from '../../../utils/get-words';
import { postJSON$ } from '../../../../utils/ajax-stream';

// NOTE(@BerkeleyTrue): this file could benefit from some refactoring.
// lots of repeat code

function postChallenge(url, body, username) {
  const saveChallenge$ = postJSON$(url, body)
    .retry(3)
    .flatMap(({ alreadyCompleted, points }) => {
      return Observable.of(
        makeToast({
            message: randomCompliment() +
              (alreadyCompleted ? '!' : '! First time Completed!'),
            type: 'info'
        }),
        updateUserPoints(username, points)
      );
    })
    .catch(createErrorObservable);

  const challengeCompleted$ = Observable.of(
    moveToNextChallenge(),
    username ? makeToast({ message: ' Saving...', type: 'info' }) : null
  );
  return Observable.merge(saveChallenge$, challengeCompleted$);
}

function submitModern(type, state) {
  const { tests } = state.challengesApp;
  if (tests.length > 0 && tests.every(test => test.pass && !test.err)) {
    if (type === types.checkChallenge) {
      return Observable.of(
        showChallengeComplete()
      );
    }

    if (type === types.submitChallenge) {
      const { challenge: { id } } = challengeSelector(state);
      const {
        app: { user, csrfToken },
        challengesApp: { files }
      } = state;
      const body = {
        id,
        _csrf: csrfToken,
        files
      };
      return postChallenge('/modern-challenge-completed', body, user);
    }
  }
  return Observable.just(makeToast({
    message: 'Not all tests are passing, yet.',
    title: 'Almost There!',
    type: 'info'
  }));
}

function submitProject(type, state, { solution, githubLink }) {
  const {
    challenge: { id, challengeType }
  } = challengeSelector(state);
  const {
    app: { user, csrfToken }
  } = state;
  const body = {
    id,
    challengeType,
    solution,
    _csrf: csrfToken
  };
  if (challengeType === backEndProject) {
    body.githubLink = githubLink;
  }
  return postChallenge('/project-completed', body, user);
}

function submitSimpleChallenge(type, state) {
  const {
    challenge: { id }
  } = challengeSelector(state);
  const {
    app: { user, csrfToken }
  } = state;
  const body = {
    id,
    _csrf: csrfToken
  };
  return postChallenge('/challenge-completed', body, user);
}

const submitTypes = {
  tests: submitModern,
  step: submitSimpleChallenge,
  video: submitSimpleChallenge,
  'project.frontEnd': submitProject,
  'project.backEnd': submitProject,
  'project.simple': submitSimpleChallenge
};

export default function completionSaga(actions$, getState) {
  return actions$
    .filter(({ type }) => (
      type === types.checkChallenge ||
      type === types.submitChallenge
    ))
    .flatMap(({ type, payload }) => {
      const state = getState();
      const { submitType } = challengeSelector(state);
      const submitter = submitTypes[submitType] ||
        (() => Observable.just(null));
      return submitter(type, state, payload);
    });
}
