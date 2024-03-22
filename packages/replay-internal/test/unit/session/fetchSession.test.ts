import { REPLAY_SESSION_KEY, WINDOW } from '../../../src/constants';
import { fetchSession } from '../../../src/session/fetchSession';

const oldSessionStorage = WINDOW.sessionStorage;

describe('Unit | session | fetchSession', () => {
  beforeAll(() => {
    WINDOW.sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(WINDOW, 'sessionStorage', {
      writable: true,
      value: oldSessionStorage,
    });
    WINDOW.sessionStorage.clear();
  });

  it('fetches a valid and sampled session', function () {
    WINDOW.sessionStorage.setItem(
      REPLAY_SESSION_KEY,
      '{"id":"fd09adfc4117477abc8de643e5a5798a","sampled": "session","started":1648827162630,"lastActivity":1648827162658}',
    );

    expect(fetchSession()).toEqual({
      id: 'fd09adfc4117477abc8de643e5a5798a',
      lastActivity: 1648827162658,
      segmentId: 0,
      sampled: 'session',
      started: 1648827162630,
    });
  });

  it('fetches an unsampled session', function () {
    WINDOW.sessionStorage.setItem(
      REPLAY_SESSION_KEY,
      '{"id":"fd09adfc4117477abc8de643e5a5798a","sampled": false,"started":1648827162630,"lastActivity":1648827162658}',
    );

    expect(fetchSession()).toEqual({
      id: 'fd09adfc4117477abc8de643e5a5798a',
      lastActivity: 1648827162658,
      segmentId: 0,
      sampled: false,
      started: 1648827162630,
    });
  });

  it('fetches a session that does not exist', function () {
    expect(fetchSession()).toBe(null);
  });

  it('fetches an invalid session', function () {
    WINDOW.sessionStorage.setItem(REPLAY_SESSION_KEY, '{"id":"fd09adfc4117477abc8de643e5a5798a",');

    expect(fetchSession()).toBe(null);
  });

  it('safely attempts to fetch session when Session Storage is disabled', function () {
    Object.defineProperty(WINDOW, 'sessionStorage', {
      writable: true,
      value: {
        getItem: () => {
          throw new Error('No Session Storage for you');
        },
      },
    });

    expect(fetchSession()).toEqual(null);
  });
});
