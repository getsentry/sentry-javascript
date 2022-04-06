import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import * as SaveSession from './saveSession';
import { updateSessionActivity } from './updateSessionActivity';

jest.mock('@sentry/browser');

beforeAll(() => {
  jest.spyOn(CreateSession, 'createSession');
  jest.spyOn(FetchSession, 'fetchSession');
  jest.spyOn(SaveSession, 'saveSession');
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  (CreateSession.createSession as jest.Mock).mockClear();
  (FetchSession.fetchSession as jest.Mock).mockClear();
  (SaveSession.saveSession as jest.Mock).mockClear();
});

it('does nothing if no sticky session', () => {
  updateSessionActivity({ stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();
  expect(SaveSession.saveSession).not.toHaveBeenCalled();
});

it('creates a new session if no existing one', () => {
  updateSessionActivity({ stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();
  expect(SaveSession.saveSession).toHaveBeenCalled();
});

it('updates an existing session', () => {
  const now = new Date().getTime();
  const lastActivity = now - 10000;
  const saveSession = SaveSession.saveSession as jest.Mock;

  saveSession({
    id: 'transaction_id',
    lastActivity,
    started: lastActivity,
  });
  // Clear mock because it will get called again
  saveSession.mockClear();

  updateSessionActivity({ stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();
  expect(saveSession.mock.calls[0][0].lastActivity).toBeGreaterThan(
    lastActivity
  );
});
