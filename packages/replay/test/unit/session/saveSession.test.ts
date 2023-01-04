import { REPLAY_SESSION_KEY, WINDOW } from '../../../src/constants';
import { saveSession } from '../../../src/session/saveSession';
import { makeSession } from '../../../src/session/Session';

describe('Unit | session | saveSession', () => {
  beforeAll(() => {
    WINDOW.sessionStorage.clear();
  });

  afterEach(() => {
    WINDOW.sessionStorage.clear();
  });

  it('saves a valid session', function () {
    const session = makeSession({
      id: 'fd09adfc4117477abc8de643e5a5798a',
      segmentId: 0,
      started: 1648827162630,
      lastActivity: 1648827162658,
      sampled: 'session',
    });
    saveSession(session);

    expect(WINDOW.sessionStorage.getItem(REPLAY_SESSION_KEY)).toEqual(JSON.stringify(session));
  });
});
