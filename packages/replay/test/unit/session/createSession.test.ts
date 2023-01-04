import * as Sentry from '@sentry/core';

import { WINDOW } from '../../../src/constants';
import { createSession } from '../../../src/session/createSession';
import { saveSession } from '../../../src/session/saveSession';

jest.mock('./../../../src/session/saveSession');

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

type CaptureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

describe('Unit | session | createSession', () => {
  const captureEventMock: CaptureEventMockType = jest.fn();

  beforeAll(() => {
    WINDOW.sessionStorage.clear();
    jest.spyOn(Sentry, 'getCurrentHub');
    (Sentry.getCurrentHub as jest.Mock).mockImplementation(() => ({
      captureEvent: captureEventMock,
    }));
  });

  afterEach(() => {
    captureEventMock.mockReset();
  });

  it('creates a new session with no sticky sessions', function () {
    const newSession = createSession({
      stickySession: false,
      sessionSampleRate: 1.0,
      errorSampleRate: 0,
    });
    expect(captureEventMock).not.toHaveBeenCalled();

    expect(saveSession).not.toHaveBeenCalled();

    expect(newSession.id).toBe('test_session_id');
    expect(newSession.started).toBeGreaterThan(0);
    expect(newSession.lastActivity).toEqual(newSession.started);
  });

  it('creates a new session with sticky sessions', function () {
    const newSession = createSession({
      stickySession: true,
      sessionSampleRate: 1.0,
      errorSampleRate: 0,
    });
    expect(captureEventMock).not.toHaveBeenCalled();

    expect(saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test_session_id',
        segmentId: 0,
        started: expect.any(Number),
        lastActivity: expect.any(Number),
      }),
    );

    expect(newSession.id).toBe('test_session_id');
    expect(newSession.started).toBeGreaterThan(0);
    expect(newSession.lastActivity).toEqual(newSession.started);
  });
});
