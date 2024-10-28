/**
 * @vitest-environment jsdom
 */

import { describe, expect, test } from 'vitest';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | getRecordingMode()', () => {
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
