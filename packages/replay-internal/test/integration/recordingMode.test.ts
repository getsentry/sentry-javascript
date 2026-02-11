/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { resetSdkMock } from '../mocks/resetSdkMock';

describe('Integration | getRecordingMode()', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  test('returns "session" when session sampling is enabled', async () => {
    const { integration } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
      },
    });
    expect(integration.getRecordingMode()).toBe('session');
  });

  test('returns "buffer" when buffering is enabled', async () => {
    const { integration, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
      },
    });
    replay.stop();
    replay.startBuffering();
    expect(integration.getRecordingMode()).toBe('buffer');
  });

  test('returns undefined when replay is stopped', async () => {
    const { integration, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
      },
    });
    replay.stop();
    expect(integration.getRecordingMode()).toBeUndefined();
  });

  test('returns undefined when session sampling is disabled', async () => {
    const { integration } = await resetSdkMock({
      replayOptions: { stickySession: false },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 0.0,
      },
    });
    expect(integration.getRecordingMode()).toBeUndefined();
  });

  test('returns "buffer" when session rate is 0 and onError rate is 1', async () => {
    const { integration } = await resetSdkMock({
      replayOptions: { stickySession: false },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    });
    expect(integration.getRecordingMode()).toBe('buffer');
  });

  test('returns "session" when both sampling rates are 1', async () => {
    const { integration } = await resetSdkMock({
      replayOptions: { stickySession: false },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 1.0,
      },
    });
    expect(integration.getRecordingMode()).toBe('session');
  });
});
