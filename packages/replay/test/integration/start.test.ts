import { getClient } from '@sentry/core';
import type { Transport } from '@sentry/types';

import { DEFAULT_FLUSH_MIN_DELAY, SESSION_IDLE_EXPIRE_DURATION } from '../../src/constants';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

describe('Integration | start', () => {
  let replay: ReplayContainer;
  let integration: Replay;

  beforeEach(async () => {
    ({ replay, integration } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
      },
    }));

    const mockTransport = getClient()?.getTransport()?.send as jest.MockedFunction<Transport['send']>;
    mockTransport?.mockClear();
    jest.runAllTimers();
    await new Promise(process.nextTick);
  });

  afterEach(async () => {
    integration.stop();

    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
  });

  it('sends replay when calling `start()` after [SESSION_IDLE_EXPIRE_DURATION]ms', async () => {
    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION + 1);

    integration.start();

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
    });
  });
});
