import * as Sentry from '@sentry/core';
import { createSession } from './createSession';
import { saveSession } from './saveSession';

type captureEventMockType = jest.MockedFunction<typeof Sentry.captureEvent>;

jest.mock('./saveSession');

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_id'),
  };
});

const captureEventMock: captureEventMockType = jest.fn();

beforeAll(() => {
  window.sessionStorage.clear();
  jest.spyOn(Sentry, 'getCurrentHub');
  (Sentry.getCurrentHub as jest.Mock).mockImplementation(() => ({
    captureEvent: captureEventMock,
  }));
});

afterEach(() => {
  captureEventMock.mockReset();
});

it('creates a new session with no sticky sessions', function () {
  const newSession = createSession({ stickySession: false });
  expect(captureEventMock).toHaveBeenCalledWith(
    { message: 'sentry-replay', tags: { sequenceId: 0 } },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).not.toHaveBeenCalled();

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});

it('creates a new session with sticky sessions', function () {
  const newSession = createSession({ stickySession: true });
  expect(captureEventMock).toHaveBeenCalledWith(
    { message: 'sentry-replay', tags: { sequenceId: 0 } },
    { event_id: 'test_session_id' }
  );

  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'test_session_id',
      sequenceId: 0,
      started: expect.any(Number),
      lastActivity: expect.any(Number),
    })
  );

  expect(newSession.id).toBe('test_session_id');
  expect(newSession.started).toBeGreaterThan(0);
  expect(newSession.lastActivity).toEqual(newSession.started);
});
