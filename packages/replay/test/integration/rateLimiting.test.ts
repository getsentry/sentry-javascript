import { getClient } from '@sentry/core';
import type { Transport, TransportMakeRequestResponse } from '@sentry/types';

import { DEFAULT_FLUSH_MIN_DELAY } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { BASE_TIMESTAMP, mockSdk } from '../index';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockTransportSend = jest.MockedFunction<Transport['send']>;

describe('Integration | rate-limiting behaviour', () => {
  let replay: ReplayContainer;
  let mockTransportSend: MockTransportSend;

  beforeEach(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));

    ({ replay } = await mockSdk({
      autoStart: false,
      replayOptions: {
        stickySession: false,
      },
    }));

    mockTransportSend = getClient()?.getTransport()?.send as MockTransportSend;
  });

  afterEach(async () => {
    clearSession(replay);
    jest.clearAllMocks();

    replay && replay.stop();
  });

  it.each([
    ['429 status code', { statusCode: 429, headers: {} } as TransportMakeRequestResponse],
    [
      '200 status code with x-sentry-rate-limits header',
      {
        statusCode: 200,
        headers: {
          'x-sentry-rate-limits': '30',
        },
      } as TransportMakeRequestResponse,
    ],
    [
      '200 status code with x-sentry-rate-limits replay header',
      {
        statusCode: 200,
        headers: {
          'x-sentry-rate-limits': '30:replay',
        },
      } as TransportMakeRequestResponse,
    ],
  ])('handles %s responses by stopping the replay', async (_name, { statusCode, headers }) => {
    const mockStop = jest.spyOn(replay, 'stop');

    mockTransportSend.mockImplementationOnce(() => {
      return Promise.resolve({ statusCode, headers });
    });

    replay.start();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(replay.session).toBeUndefined();
    expect(replay.isEnabled()).toBe(false);
  });

  it.each([
    [
      '200 status code without x-sentry-rate-limits header',
      {
        statusCode: 200,
        headers: {},
      } as TransportMakeRequestResponse,
    ],
    [
      '200 status code with x-sentry-rate-limits profile header',
      {
        statusCode: 200,
        headers: {
          'x-sentry-rate-limits': '30:profile',
        },
      } as TransportMakeRequestResponse,
    ],
  ])('handles %s responses by not stopping', async (_name, { statusCode, headers }) => {
    const mockStop = jest.spyOn(replay, 'stop');

    mockTransportSend.mockImplementationOnce(() => {
      return Promise.resolve({ statusCode, headers });
    });

    replay.start();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockStop).not.toHaveBeenCalled();
    expect(replay.session).toBeDefined();
    expect(replay.isEnabled()).toBe(true);
  });
});
