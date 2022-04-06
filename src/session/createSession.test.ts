import * as Sentry from '@sentry/browser';

import { createSession } from './createSession';
import { saveSession } from './saveSession';

jest.mock('@sentry/browser');
jest.mock('./saveSession');

beforeAll(() => {
  window.sessionStorage.clear();
});

it('creates a new session with no sticky sessions', function () {
  const newSession = createSession({ stickySession: false });

  expect(Sentry.getCurrentHub().startTransaction).toHaveBeenCalledWith({
    name: 'sentry-replay',
    tags: { isReplayRoot: 'yes' },
  });

  expect(saveSession).not.toHaveBeenCalled();

  expect(newSession.id).toBe('transaction_id');
  expect(newSession.traceId).toBe('trace_id');
  expect(newSession.spanId).toBe('span_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});

it('creates a new session with sticky sessions', function () {
  const newSession = createSession({ stickySession: true });

  expect(Sentry.getCurrentHub().startTransaction).toHaveBeenCalledWith({
    name: 'sentry-replay',
    tags: { isReplayRoot: 'yes' },
  });

  expect(saveSession).toHaveBeenCalledWith({
    id: 'transaction_id',
    traceId: 'trace_id',
    spanId: 'span_id',
    started: expect.any(Number),
    lastActivity: expect.any(Number),
  });

  expect(newSession.id).toBe('transaction_id');
  expect(newSession.traceId).toBe('trace_id');
  expect(newSession.spanId).toBe('span_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});
