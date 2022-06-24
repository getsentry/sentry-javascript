jest.mock('./saveSession');

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
  expect(newSession.sequenceId).toBe(0);

  newSession.sequenceId++;
  expect(saveSession).not.toHaveBeenCalled();
  expect(newSession.sequenceId).toBe(1);
});

it('sticky Session saves to local storage', function () {
  const newSession = new Session(undefined, { stickySession: true });

  expect(saveSession).toHaveBeenCalledTimes(0);
  expect(newSession.id).toBe('test_session_id');
  expect(newSession.sequenceId).toBe(0);

  (saveSession as jest.Mock).mockClear();

  newSession.sequenceId++;
  expect(saveSession).toHaveBeenCalledTimes(1);
  expect(saveSession).toHaveBeenCalledWith(
    expect.objectContaining({
      sequenceId: 1,
    })
  );
  expect(newSession.sequenceId).toBe(1);
});
