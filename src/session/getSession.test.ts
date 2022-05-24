import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import { getSession } from './getSession';
import { saveSession } from './saveSession';

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

function createMockSession(when: number = new Date().getTime()) {
  return {
    id: 'test_session_id',
    lastActivity: when,
    started: when,
  };
}

beforeAll(() => {
  jest.spyOn(CreateSession, 'createSession');
  jest.spyOn(FetchSession, 'fetchSession');
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  (CreateSession.createSession as jest.Mock).mockClear();
  (FetchSession.fetchSession as jest.Mock).mockClear();
});

it('creates a non-sticky session when one does not exist', function () {
  const session = getSession({ expiry: 900000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toBe(null);
});

it('creates a non-sticky session, regardless of session existing in sessionStorage', function () {
  saveSession(createMockSession(new Date().getTime() - 10000));

  const session = getSession({ expiry: 1000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toBeDefined();
});

it('creates a sticky session when one does not exist', function () {
  expect(FetchSession.fetchSession()).toBe(null);

  const session = getSession({ expiry: 900000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'test_session_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });
});

it('creates a sticky session when one does not exist', function () {
  expect(FetchSession.fetchSession()).toBe(null);

  const session = getSession({ expiry: 900000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'test_session_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });
});

it('fetches an existing sticky session', function () {
  const now = new Date().getTime();
  saveSession(createMockSession(now));

  const session = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();

  expect(session).toEqual({
    id: 'test_session_id',
    lastActivity: now,
    started: now,
  });
});

it('fetches an expired sticky session', function () {
  const now = new Date().getTime();
  saveSession(createMockSession(new Date().getTime() - 2000));

  const session = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session.id).toBe('test_session_id');
  expect(session.lastActivity).toBeGreaterThanOrEqual(now);
  expect(session.started).toBeGreaterThanOrEqual(now);
});
