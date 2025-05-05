/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { Transport } from '@sentry/core';
import { getClient } from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLUSH_MIN_DELAY, SESSION_IDLE_EXPIRE_DURATION } from '../../src/constants';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';

describe('Integration | start', () => {
  let replay: ReplayContainer;
  let integration: Replay;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(async () => {
    ({ replay, integration } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
      },
    }));

    const mockTransport = getClient()?.getTransport()?.send as vi.MockedFunction<Transport['send']>;
    mockTransport?.mockClear();
    await vi.runAllTimersAsync();
  });

  afterEach(async () => {
    integration.stop();

    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
  });

  it('sends replay when calling `start()` after [SESSION_IDLE_EXPIRE_DURATION]ms', async () => {
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_EXPIRE_DURATION + 1);

    integration.start();

    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
    });
  });

  it('does not start recording once replay is already in progress', async () => {
    const startRecordingSpy = vi.spyOn(replay, 'startRecording').mockImplementation(() => undefined);

    integration.start();
    replay.start();
    replay.start();

    expect(startRecordingSpy).toHaveBeenCalledTimes(1);
  });

  it('does not start buffering once replay is already in progress', async () => {
    const startRecordingSpy = vi.spyOn(replay, 'startRecording').mockImplementation(() => undefined);

    integration.startBuffering();
    replay.startBuffering();
    replay.startBuffering();

    expect(startRecordingSpy).toHaveBeenCalledTimes(1);
  });
});
