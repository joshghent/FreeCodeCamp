import _ from 'lodash';
import { Observable } from 'rx';
import { Actions } from 'thundercats';
import debugFactory from 'debug';

const debug = debugFactory('freecc:hikes:actions');
const noOp = { transform: () => {} };

function getCurrentHike(hikes = [{}], dashedName, currentHike) {
  if (!dashedName) {
    debug('no dashedName');
    return hikes[0];
  }

  const filterRegex = new RegExp(dashedName, 'i');
  if (currentHike && filterRegex.test(currentHike.dashedName)) {
    return currentHike;
  }

  debug('setting new hike');
  return hikes
    .filter(({ dashedName }) => {
      return filterRegex.test(dashedName);
    })
    .reduce((throwAway, hike) => {
      return hike;
    }, currentHike || {});
}

function findNextHike(hikes, id) {
  if (!id) {
    debug('find next hike no id provided');
    return hikes[0];
  }
  const currentIndex = _.findIndex(hikes, ({ id: _id }) => _id === id);
  return hikes[currentIndex + 1] || hikes[0];
}


function getMouse(e, [dx, dy]) {
  let { pageX, pageY, touches } = e;

  if (touches) {
    e.preventDefault();
    // these re-assigns the values of pageX, pageY from touches
    ({ pageX, pageY } = touches[0]);
  }

  return [pageX - dx, pageY - dy];
}

export default Actions({
  refs: { displayName: 'HikesActions' },
  shouldBindMethods: true,
  fetchHikes({ isPrimed, dashedName }) {
    if (isPrimed) {
      return {
        transform: (state) => {

          const { hikesApp: oldState } = state;
          const currentHike = getCurrentHike(
            oldState.hikes,
            dashedName,
            oldState.currentHike
          );

          const hikesApp = { ...oldState, currentHike };
          return Object.assign({}, state, { hikesApp });
        }
      };
    }

    return this.readService$('hikes', null, null)
      .map(hikes => {
        const currentHike = getCurrentHike(hikes, dashedName);
        return {
          transform(state) {
            const hikesApp = { ...state.hikesApp, currentHike, hikes };
            return { ...state, hikesApp };
          }
        };
      })
      .catch(err => Observable.just({
        transform(state) { return { ...state, err }; }
      }));
  },

  toggleQuestions() {
    return {
      transform(state) {
        const hikesApp = {
          ...state.hikesApp,
          showQuestions: !state.hikesApp.showQuestions,
          currentQuestion: 1
        };
        return { ...state, hikesApp };
      }
    };
  },

  hideInfo() {
    return {
      transform(state) {
        const hikesApp = { ...state.hikesApp, showInfo: false };
        return { ...state, hikesApp };
      }
    };
  },

  grabQuestion(e) {
    let { pageX, pageY, touches } = e;
    if (touches) {
      e.preventDefault();
      // these re-assigns the values of pageX, pageY from touches
      ({ pageX, pageY } = touches[0]);
    }
    const delta = [pageX, pageY];
    const mouse = [0, 0];

    return {
      transform(state) {
        return {
          ...state,
          hikesApp: {
            ...state.hikesApp,
            isPressed: true,
            delta,
            mouse
          }
        };
      }
    };
  },

  releaseQuestion() {
    return {
      transform(state) {
        return {
          ...state,
          hikesApp: {
            ...state.hikesApp,
            isPressed: false,
            mouse: [0, 0]
          }
        };
      }
    };
  },

  moveQuestion({ e, delta }) {
    const mouse = getMouse(e, delta);

    return {
      transform(state) {
        return {
          ...state,
          hikesApp: {
            ...state.hikesApp,
            mouse
          }
        };
      }
    };
  },

  answer({
    e,
    answer,
    userAnswer,
    hike: { id, name, tests, challengeType },
    currentQuestion,
    isSignedIn,
    delta,
    threshold
  }) {
    if (typeof userAnswer === 'undefined') {
      const [positionX] = getMouse(e, delta);

      // question released under threshold
      if (Math.abs(positionX) < threshold) {
        return noOp;
      }

      if (positionX >= threshold) {
        userAnswer = true;
      }

      if (positionX <= -threshold) {
        userAnswer = false;
      }
    }

    // incorrect question
    if (answer !== userAnswer) {
      const startShake = {
        transform(state) {
          return {
            ...state,
            hikesApp: {
              ...state.hikesApp,
              showInfo: true,
              shake: true
            }
          };
        }
      };

      const removeShake = {
        transform(state) {
          return {
            ...state,
            hikesApp: {
              ...state.hikesApp,
              shake: false
            }
          };
        }
      };

      return Observable
        .just(removeShake)
        .delay(500)
        .startWith(startShake);
    }

    // move to next question
    // index 0
    if (tests[currentQuestion]) {

      return Observable.just({
        transform(state) {
          const hikesApp = {
            ...state.hikesApp,
            mouse: [0, 0],
            showInfo: false
          };
          return { ...state, hikesApp };
        }
      })
        .delay(300)
        .startWith({
          transform(state) {

            const hikesApp = {
              ...state.hikesApp,
              currentQuestion: currentQuestion + 1,
              mouse: [ userAnswer ? 1000 : -1000, 0],
              isPressed: false
            };

            return { ...state, hikesApp };
          }
        });
    }

    // challenge completed
    const optimisticSave = isSignedIn ?
      this.post$('/completed-challenge', { id, name, challengeType }) :
      Observable.just(true);

    const correctAnswer = {
      transform(state) {
        return {
          ...state,
          hikesApp: {
            ...state.hikesApp,
            isCorrect: true,
            isPressed: false,
            delta: [0, 0],
            mouse: [ userAnswer ? 1000 : -1000, 0]
          }
        };
      }
    };

    return Observable.just({
        transform(state) {
          const { hikes, currentHike: { id } } = state.hikesApp;
          const currentHike = findNextHike(hikes, id);

          return {
            ...state,
            points: isSignedIn ? state.points + 1 : state.points,
            hikesApp: {
              ...state.hikesApp,
              currentHike,
              showQuestions: false,
              currentQuestion: 1,
              mouse: [0, 0]
            },
            toast: {
              title: 'Congratulations!',
              message: 'Hike completed',
              id: state.toast && typeof state.toast.id === 'number' ?
                state.toast.id + 1 :
                0,
              type: 'success'
            },
            location: {
              action: 'PUSH',
              pathname: currentHike && currentHike.dashedName ?
                `/hikes/${ currentHike.dashedName }` :
                '/hikes'
            }
          };
        },
        optimistic: optimisticSave
      })
      .delay(300)
      .startWith(correctAnswer)
      .catch(err => Observable.just({
        transform(state) { return { ...state, err }; }
      }));
  },
  resetHike() {
    return {
      transform(state) {
        return { ...state,
          hikesApp: {
            ...state.hikesApp,
            currentQuestion: 1,
            showQuestions: false,
            showInfo: false,
            mouse: [0, 0],
            delta: [0, 0]
          }
        };
      }
    };
  }
});
