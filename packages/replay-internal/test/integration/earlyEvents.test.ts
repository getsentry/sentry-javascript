/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BASE_TIMESTAMP } from '..';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | early events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates initialTimestamp for early performance entries', async () => {
    const earlyTimeStampSeconds = BASE_TIMESTAMP / 1000 - 10;

    const { replay } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
      },
    });

    expect(replay.session).toBeDefined();
    expect(replay['_requiresManualStart']).toBe(false);

    const initialTimestamp = replay.getContext().initialTimestamp;

    expect(initialTimestamp).not.toEqual(earlyTimeStampSeconds * 1000);

    // A performance entry that happened before should not extend the session when we manually started
    replay.replayPerformanceEntries.push({
      type: 'largest-contentful-paint',
      name: 'largest-contentful-paint',
      start: earlyTimeStampSeconds,
      end: earlyTimeStampSeconds,
      data: {
        value: 100,
        size: 100,
        nodeId: undefined,
      },
    });

    // _too_ early events are always thrown away
    replay.replayPerformanceEntries.push({
      type: 'largest-contentful-paint',
      name: 'largest-contentful-paint',
      start: earlyTimeStampSeconds - 999999,
      end: earlyTimeStampSeconds - 99999,
      data: {
        value: 100,
        size: 100,
        nodeId: undefined,
      },
    });

    await replay.flushImmediate();
    vi.runAllTimers();

    expect(replay.getContext().initialTimestamp).toEqual(earlyTimeStampSeconds * 1000);
  });

  it('does not change initialTimestamp when replay is manually started', async () => {
    const earlyTimeStampSeconds = Date.now() / 1000 - 5;

    const { replay } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 0.0,
      },
    });

    expect(replay.session).toBe(undefined);
    expect(replay['_requiresManualStart']).toBe(true);

    replay.start();
    vi.runAllTimers();

    const initialTimestamp = replay.getContext().initialTimestamp;

    expect(initialTimestamp).not.toEqual(earlyTimeStampSeconds * 1000);
    expect(replay.session).toBeDefined();
    expect(replay['_requiresManualStart']).toBe(true);

    // A performance entry that happened before should not extend the session when we manually started
    replay.replayPerformanceEntries.push({
      type: 'largest-contentful-paint',
      name: 'largest-contentful-paint',
      start: earlyTimeStampSeconds,
      end: earlyTimeStampSeconds,
      data: {
        value: 100,
        size: 100,
        nodeId: undefined,
      },
    });

    await replay.flushImmediate();
    vi.runAllTimers();

    expect(replay.getContext().initialTimestamp).toEqual(initialTimestamp);
  });
});
