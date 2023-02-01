import { getCurrentHub } from '@sentry/core';
import type { Transport, TransportMakeRequestResponse } from '@sentry/types';

import { DEFAULT_FLUSH_MIN_DELAY, SESSION_IDLE_DURATION } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import * as SendReplayRequest from '../../src/util/sendReplayRequest';
import { BASE_TIMESTAMP, mockSdk } from '../index';
import { mockRrweb } from '../mocks/mockRrweb';
import { clearSession } from '../utils/clearSession';
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
  let mockSendReplayRequest: jest.MockedFunction<any>;
  const { record: mockRecord } = mockRrweb();

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));

    ({ replay } = await mockSdk({
      replayOptions: {
        stickySession: false,
      },
    }));

    jest.runAllTimers();
    mockTransportSend = getCurrentHub()?.getClient()?.getTransport()?.send as MockTransportSend;
    mockSendReplayRequest = jest.spyOn(SendReplayRequest, 'sendReplayRequest');
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockRecord.takeFullSnapshot.mockClear();
    mockTransportSend.mockClear();

    // Create a new session and clear mocks because a segment (from initial
    // checkout) will have already been uploaded by the time the tests run
    clearSession(replay);
    replay['_loadAndCheckSession'](0);

    mockSendReplayRequest.mockClear();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    clearSession(replay);
    jest.clearAllMocks();
    replay['_loadAndCheckSession'](SESSION_IDLE_DURATION);
  });

  afterAll(() => {
    replay && replay.stop();
  });

  it.each([
    {
      statusCode: 429,
      headers: {
        'x-sentry-rate-limits': '30',
        'retry-after': null,
      },
    },
    {
      statusCode: 429,
      headers: {
        'x-sentry-rate-limits': '30:replay',
        'retry-after': null,
      },
    },
    {
      statusCode: 429,
      headers: {
        'x-sentry-rate-limits': null,
        'retry-after': '30',
      },
    },
  ] as TransportMakeRequestResponse[])(
    'pauses recording and flushing a rate limit is hit and resumes both after the rate limit duration is over %j',
    async rateLimitResponse => {
      expect(replay.session?.segmentId).toBe(0);
      jest.spyOn(replay, 'pause');
      jest.spyOn(replay, 'resume');
      // @ts-ignore private API
      jest.spyOn(replay, '_handleRateLimit');

      const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

      mockTransportSend.mockImplementationOnce(() => {
        return Promise.resolve(rateLimitResponse);
      });

      mockRecord._emitter(TEST_EVENT);

      // T = base + 5
      await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

      expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
      expect(mockTransportSend).toHaveBeenCalledTimes(1);
      expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT]) });

      expect(replay['_handleRateLimit']).toHaveBeenCalledTimes(1);
      // resume() was called once before we even started
      expect(replay.resume).not.toHaveBeenCalled();
      expect(replay.pause).toHaveBeenCalledTimes(1);

      // No user activity to trigger an update
      expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
      expect(replay.session?.segmentId).toBe(1);

      // let's simulate the rate-limit time of inactivity (30secs) and check that we don't do anything in the meantime
      const TEST_EVENT2 = { data: {}, timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY, type: 3 };
      for (let i = 0; i < 5; i++) {
        const ev = {
          ...TEST_EVENT2,
          timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY * (i + 1),
        };
        mockRecord._emitter(ev);
        await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
        expect(replay.isPaused()).toBe(true);
        expect(mockSendReplayRequest).toHaveBeenCalledTimes(1);
        expect(mockTransportSend).toHaveBeenCalledTimes(1);
      }

      // T = base + 35
      await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

      // now, recording should resume and first, we expect a checkout event to be sent, as resume()
      // should trigger a full snapshot
      expect(replay.resume).toHaveBeenCalledTimes(1);
      expect(replay.isPaused()).toBe(false);

      expect(mockSendReplayRequest).toHaveBeenCalledTimes(2);
      expect(replay).toHaveLastSentReplay({
        recordingData: JSON.stringify([
          { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY * 7, type: 2 },
        ]),
      });

      // and let's also emit a new event and check that it is recorded
      const TEST_EVENT3 = {
        data: {},
        timestamp: BASE_TIMESTAMP + 7 * DEFAULT_FLUSH_MIN_DELAY,
        type: 3,
      };
      mockRecord._emitter(TEST_EVENT3);

      // T = base + 40
      await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
      expect(mockSendReplayRequest).toHaveBeenCalledTimes(3);
      expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT3]) });

      // nothing should happen afterwards
      // T = base + 60
      await advanceTimers(20_000);
      expect(mockSendReplayRequest).toHaveBeenCalledTimes(3);
      expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT3]) });

      // events array should be empty
      expect(replay.eventBuffer?.hasEvents).toBe(false);
    },
  );

  it('handles rate-limits from a plain 429 response without any retry time', async () => {
    expect(replay.session?.segmentId).toBe(0);
    jest.spyOn(replay, 'pause');
    jest.spyOn(replay, 'resume');
    // @ts-ignore private API
    jest.spyOn(replay, '_handleRateLimit');

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

    mockTransportSend.mockImplementationOnce(() => {
      return Promise.resolve({ statusCode: 429 });
    });

    mockRecord._emitter(TEST_EVENT);

    // T = base + 5
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(mockTransportSend).toHaveBeenCalledTimes(1);
    expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT]) });

    expect(replay['_handleRateLimit']).toHaveBeenCalledTimes(1);
    // resume() was called once before we even started
    expect(replay.resume).not.toHaveBeenCalled();
    expect(replay.pause).toHaveBeenCalledTimes(1);

    // No user activity to trigger an update
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // let's simulate the rate-limit time of inactivity (60secs) and check that we don't do anything in the meantime
    // 60secs are the default we fall back to in the plain 429 case in updateRateLimits()
    const TEST_EVENT2 = { data: {}, timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY, type: 3 };
    for (let i = 0; i < 11; i++) {
      const ev = {
        ...TEST_EVENT2,
        timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY * (i + 1),
      };
      mockRecord._emitter(ev);
      await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
      expect(replay.isPaused()).toBe(true);
      expect(mockSendReplayRequest).toHaveBeenCalledTimes(1);
      expect(mockTransportSend).toHaveBeenCalledTimes(1);
    }

    // T = base + 60
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    // now, recording should resume and first, we expect a checkout event to be sent, as resume()
    // should trigger a full snapshot
    expect(replay.resume).toHaveBeenCalledTimes(1);
    expect(replay.isPaused()).toBe(false);

    expect(mockSendReplayRequest).toHaveBeenCalledTimes(2);
    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY * 13, type: 2 },
      ]),
    });

    // and let's also emit a new event and check that it is recorded
    const TEST_EVENT3 = {
      data: {},
      timestamp: BASE_TIMESTAMP + 7 * DEFAULT_FLUSH_MIN_DELAY,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT3);

    // T = base + 65
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(mockSendReplayRequest).toHaveBeenCalledTimes(3);
    expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT3]) });

    // nothing should happen afterwards
    // T = base + 85
    await advanceTimers(20_000);
    expect(mockSendReplayRequest).toHaveBeenCalledTimes(3);
    expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT3]) });

    // events array should be empty
    expect(replay.eventBuffer?.hasEvents).toBe(false);
  });

  it("doesn't do anything, if a rate limit is hit and recording is already paused", async () => {
    let paused = false;
    expect(replay.session?.segmentId).toBe(0);
    jest.spyOn(replay, 'isPaused').mockImplementation(() => {
      return paused;
    });
    jest.spyOn(replay, 'pause');
    jest.spyOn(replay, 'resume');
    // @ts-ignore private API
    jest.spyOn(replay, '_handleRateLimit');

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

    mockTransportSend.mockImplementationOnce(() => {
      return Promise.resolve({ statusCode: 429 });
    });

    mockRecord._emitter(TEST_EVENT);
    paused = true;

    // T = base + 5
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    expect(replay).toHaveLastSentReplay({ recordingData: JSON.stringify([TEST_EVENT]) });

    expect(replay['_handleRateLimit']).toHaveBeenCalledTimes(1);
    expect(replay.resume).not.toHaveBeenCalled();
    expect(replay.isPaused).toHaveBeenCalledTimes(2);
    expect(replay.pause).not.toHaveBeenCalled();
  });
});
