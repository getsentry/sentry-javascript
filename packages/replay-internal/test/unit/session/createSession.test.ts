/**
 * @vitest-environment jsdom
 */

import type { MockedFunction } from 'vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as Sentry from '@sentry/core';

import type { Hub } from '@sentry/core';
import { WINDOW } from '../../../src/constants';
import { createSession } from '../../../src/session/createSession';
import { saveSession } from '../../../src/session/saveSession';

vi.mock('./../../../src/session/saveSession');

vi.mock('@sentry/core', async () => {
  return {
    ...((await vi.importActual('@sentry/core')) as { string: unknown }),
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

type CaptureEventMockType = MockedFunction<typeof Sentry.captureEvent>;

describe('Unit | session | createSession', () => {
  const captureEventMock: CaptureEventMockType = vi.fn();

  beforeAll(() => {
    WINDOW.sessionStorage.clear();
    vi.spyOn(Sentry, 'getCurrentHub').mockImplementation(() => {
      return {
        captureEvent: captureEventMock,
        // eslint-disable-next-line deprecation/deprecation
      } as unknown as Hub;
    });
  });

  afterEach(() => {
    captureEventMock.mockReset();
  });

  it('creates a new session with no sticky sessions', function () {
    const newSession = createSession({
      stickySession: false,
      sessionSampleRate: 1.0,
      allowBuffering: false,
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
      allowBuffering: false,
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
