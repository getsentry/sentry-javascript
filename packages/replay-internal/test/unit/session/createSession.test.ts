/**
 * @vitest-environment jsdom
 */

import type * as Sentry from '@sentry/core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../../../src/constants';
import { createSession } from '../../../src/session/createSession';
import { saveSession } from '../../../src/session/saveSession';

vi.mock('./../../../src/session/saveSession');

vi.mock('@sentry/core', async () => {
  return {
    ...(await vi.importActual('@sentry/core')),
    uuid4: vi.fn(() => 'test_session_id'),
  };
});

describe('Unit | session | createSession', () => {
  const captureEventMock = vi.fn<typeof Sentry.captureEvent>();

  beforeAll(() => {
    WINDOW.sessionStorage.clear();
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
