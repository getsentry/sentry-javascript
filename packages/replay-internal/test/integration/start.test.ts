import { vi } from 'vitest';

import { getClient } from '@sentry/core';
import type { Transport } from '@sentry/types';

import {
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_REPLAY_DURATION,
  SESSION_IDLE_EXPIRE_DURATION,
  WINDOW,
} from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { BASE_TIMESTAMP } from '../index';
import type { RecordMock } from '../mocks/mockRrweb';
import { resetSdkMock } from '../mocks/resetSdkMock';
import type { DomHandler } from '../types';
import { useFakeTimers } from '../utils/use-fake-timers';
import type { Replay } from '../../src/integration';

useFakeTimers();

const prevLocation = WINDOW.location;

describe('Integration | start', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  let domHandler: DomHandler;
  let mockRecord: RecordMock;

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay, integration } = await resetSdkMock({
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

    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
  });

  it('sends replay when calling `start()` after [SESSION_IDLE_EXPIRE_DURATION]ms', async () => {
    await vi.advanceTimersByTimeAsync(SESSION_IDLE_EXPIRE_DURATION + 1);

    integration.start();

    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
    });
  });
});
