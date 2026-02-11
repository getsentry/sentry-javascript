/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { Transport, TransportMakeRequestResponse } from '@sentry/core';
import { getClient } from '@sentry/core';
import type { MockedFunction } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLUSH_MIN_DELAY } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { BASE_TIMESTAMP, mockSdk } from '../index';

async function advanceTimers(time: number) {
  vi.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockTransportSend = MockedFunction<Transport['send']>;

describe('Integration | rate-limiting behaviour', () => {
  let replay: ReplayContainer;
  let mockTransportSend: MockTransportSend;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(async () => {
    vi.setSystemTime(new Date(BASE_TIMESTAMP));

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
    vi.clearAllMocks();

    replay?.stop();
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
    const mockStop = vi.spyOn(replay, 'stop');

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
    const mockStop = vi.spyOn(replay, 'stop');

    mockTransportSend.mockImplementationOnce(() => {
      return Promise.resolve({ statusCode, headers });
    });

    replay.start();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockStop).not.toHaveBeenCalled();
    expect(replay.session).toBeDefined();
    expect(replay.isEnabled()).toBe(true);
  });

  it('records dropped event with ratelimit_backoff reason when rate limited', async () => {
    const client = getClient()!;
    const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

    mockTransportSend.mockImplementationOnce(() => {
      return Promise.resolve({ statusCode: 429, headers: { 'retry-after': '10' } } as TransportMakeRequestResponse);
    });

    replay.start();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(replay.isEnabled()).toBe(false);
    expect(recordDroppedEventSpy).toHaveBeenCalledWith('ratelimit_backoff', 'replay');

    recordDroppedEventSpy.mockRestore();
  });

  it('records dropped event with send_error reason when transport fails', async () => {
    const client = getClient()!;
    const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

    mockTransportSend.mockImplementation(() => {
      return Promise.reject(new Error('Network error'));
    });

    replay.start();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    await advanceTimers(5000);
    await advanceTimers(10000);
    await advanceTimers(30000);

    expect(replay.isEnabled()).toBe(false);
    expect(recordDroppedEventSpy).toHaveBeenCalledWith('send_error', 'replay');

    recordDroppedEventSpy.mockRestore();
  });
});
