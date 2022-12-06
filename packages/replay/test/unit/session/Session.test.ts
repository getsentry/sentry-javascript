jest.mock('./../../../src/session/saveSession');

jest.mock('@sentry/browser', () => {
  const originalModule = jest.requireActual('@sentry/browser');

  return {
    ...originalModule,
    getCurrentHub: jest.fn(() => {
      return {
        captureEvent: jest.fn(),
        getClient: jest.fn(() => ({ getDsn: jest.fn() })),
      };
    }),
  };
});

jest.mock('@sentry/utils', () => {
  const originalModule = jest.requireActual('@sentry/utils');

  return {
    ...originalModule,
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

import * as Sentry from '@sentry/browser';

import { WINDOW } from '../../../src/constants';
import { getSessionSampleType, makeSession } from '../../../src/session/Session';

type CaptureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

beforeEach(() => {
  WINDOW.sessionStorage.clear();
});

afterEach(() => {
  (Sentry.getCurrentHub().captureEvent as CaptureEventMockType).mockReset();
});

it('does not sample', function () {
  const newSession = makeSession({
    sampled: getSessionSampleType(0, 0),
  });

  expect(newSession.sampled).toBe(false);
});

it('samples using `sessionSampleRate`', function () {
  const newSession = makeSession({
    sampled: getSessionSampleType(1.0, 0),
  });

  expect(newSession.sampled).toBe('session');
});

it('samples using `errorSampleRate`', function () {
  const newSession = makeSession({
    sampled: getSessionSampleType(0, 1),
  });

  expect(newSession.sampled).toBe('error');
});

it('does not run sampling function if existing session was sampled', function () {
  const newSession = makeSession({
    sampled: 'session',
  });

  expect(newSession.sampled).toBe('session');
});
