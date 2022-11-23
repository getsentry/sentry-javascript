import { REPLAY_SESSION_KEY } from '../../../src/session/constants';
import { fetchSession } from '../../../src/session/fetchSession';

const oldSessionStorage = window.sessionStorage;

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'sessionStorage', {
    writable: true,
    value: oldSessionStorage,
  });
  window.sessionStorage.clear();
});

const SAMPLE_RATES = {
  sessionSampleRate: 1.0,
  errorSampleRate: 0.0,
};

it('fetches a valid and sampled session', function () {
  window.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    '{"id":"fd09adfc4117477abc8de643e5a5798a","sampled": true,"started":1648827162630,"lastActivity":1648827162658}',
  );

  expect(fetchSession(SAMPLE_RATES)?.toJSON()).toEqual({
    id: 'fd09adfc4117477abc8de643e5a5798a',
    lastActivity: 1648827162658,
    segmentId: 0,
    sampled: true,
    started: 1648827162630,
  });
});

it('fetches a session that does not exist', function () {
  expect(fetchSession(SAMPLE_RATES)).toBe(null);
});

it('fetches an invalid session', function () {
  window.sessionStorage.setItem(REPLAY_SESSION_KEY, '{"id":"fd09adfc4117477abc8de643e5a5798a",');

  expect(fetchSession(SAMPLE_RATES)).toBe(null);
});

it('safely attempts to fetch session when Session Storage is disabled', function () {
  Object.defineProperty(window, 'sessionStorage', {
    writable: true,
    value: {
      getItem: () => {
        throw new Error('No Session Storage for you');
      },
    },
  });

  expect(fetchSession(SAMPLE_RATES)).toEqual(null);
});
