jest.mock('./../../../src/session/saveSession');

import * as Sentry from '@sentry/browser';

import { saveSession } from '../../../src/session/saveSession';
import { Session } from '../../../src/session/Session';

type CaptureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

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
  (Sentry.getCurrentHub().captureEvent as CaptureEventMockType).mockReset();
});

it('non-sticky Session does not save to local storage', function () {
  const newSession = new Session(undefined, {
    stickySession: false,
    sessionSampleRate: 1.0,
    errorSampleRate: 0,
  });

  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.segmentId).toBe(0);

  newSession.segmentId++;
  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.segmentId).toBe(1);
});

it('sticky Session saves to local storage', function () {
  const newSession = new Session(undefined, {
    stickySession: true,
    sessionSampleRate: 1.0,
    errorSampleRate: 0,
  });

  expect(saveSession).toHaveBeenCalledTimes(0);
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.segmentId).toBe(0);

  (saveSession as jest.Mock).mockClear();

  newSession.segmentId++;
  expect(saveSession).toHaveBeenCalledTimes(1);
  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      segmentId: 1,
    }),
  );
  expect(newSession.segmentId).toBe(1);
});

it('does not sample', function () {
  const newSession = new Session(undefined, {
    stickySession: true,
    sessionSampleRate: 0.0,
    errorSampleRate: 0.0,
  });

  expect(newSession.sampled).toBe(false);
});

it('samples using `sessionSampleRate`', function () {
  const newSession = new Session(undefined, {
    stickySession: true,
    sessionSampleRate: 1.0,
    errorSampleRate: 0.0,
  });

  expect(newSession.sampled).toBe('session');
});

it('samples using `errorSampleRate`', function () {
  const newSession = new Session(undefined, {
    stickySession: true,
    sessionSampleRate: 0,
    errorSampleRate: 1.0,
  });

  expect(newSession.sampled).toBe('error');
});

it('does not run sampling function if existing session was sampled', function () {
  const newSession = new Session(
    {
      sampled: 'session',
    },
    {
      stickySession: true,
      sessionSampleRate: 0,
      errorSampleRate: 0,
    },
  );

  expect(newSession.sampled).toBe('session');
});
