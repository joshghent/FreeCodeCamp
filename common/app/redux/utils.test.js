import test from 'tape';
import {
  filterComingSoonBetaChallenge,
  filterComingSoonBetaFromEntities
} from './utils.js';


test.test('filterComingSoonBetaChallenge', t => {
  t.plan(4);
  t.test('should return true when not coming-soon/beta', t => {
    let isDev;
    t.ok(filterComingSoonBetaChallenge(isDev, {}));
    t.ok(filterComingSoonBetaChallenge(true, {}));
    t.end();
  });
  t.test('should return false when isComingSoon', t => {
    let isDev;
    t.notOk(filterComingSoonBetaChallenge(isDev, { isComingSoon: true }));
    t.end();
  });
  t.test('should return false when isBeta', t => {
    let isDev;
    t.notOk(filterComingSoonBetaChallenge(isDev, { isBeta: true }));
    t.end();
  });
  t.test('should always return true when in dev', t => {
    let isDev = true;
    t.ok(filterComingSoonBetaChallenge(isDev, { isBeta: true }));
    t.ok(filterComingSoonBetaChallenge(isDev, { isComingSoon: true }));
    t.ok(filterComingSoonBetaChallenge(
      isDev,
      { isBeta: true, isCompleted: true }
    ));
    t.end();
  });
});
test.test('filterComingSoonBetaFromEntities', t => {
  t.plan(2);
  t.test('should filter isBeta|coming-soon by default', t => {
    t.plan(2);
    const normalChallenge = { dashedName: 'normal-challenge' };
    const entities = {
      challenge: {
        'coming-soon': {
          isComingSoon: true
        },
        'is-beta': {
          isBeta: true
        },
        [normalChallenge.dashedName]: normalChallenge
      }
    };
    const actual = filterComingSoonBetaFromEntities(entities);
    t.isEqual(
      Object.keys(actual.challenge).length,
      1,
      'did not filter the correct amount of challenges'
    );
    t.isEqual(
      actual.challenge[normalChallenge.dashedName],
      normalChallenge,
      'did not return the correct challenge'
    );
  });
  t.test('should not filter isBeta|coming-soon when isDev', t => {
    t.plan(1);
    const normalChallenge = { dashedName: 'normal-challenge' };
    const entities = {
      challenge: {
        'coming-soon': {
          dashedName: 'coming-soon',
          isComingSoon: true
        },
        'is-beta': {
          dashedName: 'is-beta',
          isBeta: true
        },
        'is-both': {
          dashedName: 'is-both',
          isBeta: true
        },
        [normalChallenge.dashedName]: normalChallenge
      }
    };
    const actual = filterComingSoonBetaFromEntities(entities, true);
    t.isEqual(
      Object.keys(actual.challenge).length,
      4,
      'filtered challenges'
    );
  });
});
