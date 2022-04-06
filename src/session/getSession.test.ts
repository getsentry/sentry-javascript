import * as CreateSession from './createSession';
import * as FetchSession from './fetchSession';
import { getSession } from './getSession';
import { saveSession } from './saveSession';

jest.mock('@sentry/browser');

function createMockSession(when: number = new Date().getTime()) {
  return {
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
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
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
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
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
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
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
    lastActivity: expect.any(Number),
    started: expect.any(Number),
  });

  // Should not have anything in storage
  expect(FetchSession.fetchSession()).toEqual({
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
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
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
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

  expect(session.id).toBe('transaction_id');
  expect(session.traceId).toBe('trace_id');
  expect(session.spanId).toBe('span_id');
  expect(session.lastActivity).toBeGreaterThanOrEqual(now);
  expect(session.started).toBeGreaterThanOrEqual(now);
});
