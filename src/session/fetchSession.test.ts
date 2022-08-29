import { REPLAY_SESSION_KEY } from './constants';
import { fetchSession } from './fetchSession';

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

it('fetches a valid session', function () {
  window.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    '{"id":"fd09adfc4117477abc8de643e5a5798a","started":1648827162630,"lastActivity":1648827162658}'
  );

  expect(fetchSession()?.toJSON()).toEqual({
    id: 'fd09adfc4117477abc8de643e5a5798a',
    lastActivity: 1648827162658,
    segmentId: 0,
    sampled: true,
    started: 1648827162630,
  });
});

it('fetches an invalid session', function () {
  window.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    '{"id":"fd09adfc4117477abc8de643e5a5798a",'
  );

  expect(fetchSession()).toBe(null);
});
