import { REPLAY_SESSION_KEY } from './constants';
import { saveSession } from './saveSession';

beforeAll(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

it('saves a valid session', function () {
  const session = {
    id: 'fd09adfc4117477abc8de643e5a5798a',
    traceId: 'traceId',
    spanId: 'spanId',
    sequenceId: 0,
    started: 1648827162630,
    lastActivity: 1648827162658,
  };
  saveSession(session);

  expect(window.sessionStorage.getItem(REPLAY_SESSION_KEY)).toEqual(
    JSON.stringify(session)
  );
});
