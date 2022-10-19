import { afterEach, beforeAll, expect, it, jest } from '@jest/globals';

import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import { getSession } from './getSession';
import { saveSession } from './saveSession';
import { Session } from './Session';

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

function createMockSession(when: number = new Date().getTime()) {
  return new Session({
    id: 'test_session_id',
    segmentId: 0,
    lastActivity: when,
    started: when,
  });
}

beforeAll(() => {
  jest.spyOn(CreateSession, 'createSession');
  jest.spyOn(FetchSession, 'fetchSession');
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  (
    CreateSession.createSession as jest.MockedFunction<
      typeof CreateSession.createSession
    >
  ).mockClear();
  (
    FetchSession.fetchSession as jest.MockedFunction<
      typeof FetchSession.fetchSession
    >
  ).mockClear();
});

it('creates a non-sticky session when one does not exist', function () {
  const { session } = getSession({ expiry: 900000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session.toJSON()).toEqual({
    id: 'test_session_id',
    segmentId: 0,
    lastActivity: expect.any(Number),
    sampled: true,
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toBe(null);
});

it('creates a non-sticky session, regardless of session existing in sessionStorage', function () {
  saveSession(createMockSession(new Date().getTime() - 10000));

  const { session } = getSession({ expiry: 1000, stickySession: false });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toBeDefined();
});

it('creates a non-sticky session, when one is expired', function () {
  const { session } = getSession({
    expiry: 1000,
    stickySession: false,
    currentSession: new Session({
      id: 'old_session_id',
      lastActivity: new Date().getTime() - 1001,
      started: new Date().getTime() - 1001,
      segmentId: 0,
    }),
  });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session).toBeDefined();
  expect(session.id).not.toBe('old_session_id');
});

it('creates a sticky session when one does not exist', function () {
  expect(FetchSession.fetchSession()).toBe(null);

  const { session } = getSession({ expiry: 900000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session.toJSON()).toEqual({
    id: 'test_session_id',
    segmentId: 0,
    lastActivity: expect.any(Number),
    sampled: true,
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()?.toJSON()).toEqual({
    id: 'test_session_id',
    segmentId: 0,
    lastActivity: expect.any(Number),
    sampled: true,
    started: expect.any(Number),
  });
});

it('fetches an existing sticky session', function () {
  const now = new Date().getTime();
  saveSession(createMockSession(now));

  const { session } = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();

  expect(session.toJSON()).toEqual({
    id: 'test_session_id',
    segmentId: 0,
    lastActivity: now,
    sampled: true,
    started: now,
  });
});

it('fetches an expired sticky session', function () {
  const now = new Date().getTime();
  saveSession(createMockSession(new Date().getTime() - 2000));

  const { session } = getSession({ expiry: 1000, stickySession: true });

  expect(FetchSession.fetchSession).toHaveBeenCalled();
  expect(CreateSession.createSession).toHaveBeenCalled();

  expect(session.id).toBe('test_session_id');
  expect(session.lastActivity).toBeGreaterThanOrEqual(now);
  expect(session.started).toBeGreaterThanOrEqual(now);
  expect(session.segmentId).toBe(0);
});

it('fetches a non-expired non-sticky session', function () {
  const { session } = getSession({
    expiry: 1000,
    stickySession: false,
    currentSession: new Session({
      id: 'test_session_id_2',
      lastActivity: +new Date() - 500,
      started: +new Date() - 500,
      segmentId: 0,
    }),
  });

  expect(FetchSession.fetchSession).not.toHaveBeenCalled();
  expect(CreateSession.createSession).not.toHaveBeenCalled();

  expect(session.id).toBe('test_session_id_2');
  expect(session.segmentId).toBe(0);
});
