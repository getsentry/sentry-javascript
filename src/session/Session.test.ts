jest.mock('./saveSession');

import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/browser';

import { saveSession } from './saveSession';
import { Session } from './Session';

type captureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

jest.mock('@sentry/browser');

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  (Sentry.getCurrentHub().captureEvent as captureEventMockType).mockReset();
});

it('non-sticky Session does not save to local storage', function () {
  const newSession = new Session(undefined, { stickySession: false });

  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.segmentId).toBe(0);

  newSession.segmentId++;
  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.segmentId).toBe(1);
});

it('sticky Session saves to local storage', function () {
  const newSession = new Session(undefined, { stickySession: true });

  expect(saveSession).toHaveBeenCalledTimes(0);
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.segmentId).toBe(0);

  (saveSession as jest.Mock).mockClear();

  newSession.segmentId++;
  expect(saveSession).toHaveBeenCalledTimes(1);
  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      segmentId: 1,
    })
  );
  expect(newSession.segmentId).toBe(1);
});
