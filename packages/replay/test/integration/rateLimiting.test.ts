import { getCurrentHub } from '@sentry/core';
import type { Transport } from '@sentry/types';

import { DEFAULT_FLUSH_MIN_DELAY } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import * as SendReplayRequest from '../../src/util/sendReplayRequest';
import { BASE_TIMESTAMP, mockSdk } from '../index';
import { mockRrweb } from '../mocks/mockRrweb';
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
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    mockSendReplayRequest.mockClear();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    clearSession(replay);
    jest.clearAllMocks();
  });

  afterAll(() => {
    replay && replay.stop();
  });

  it('handles rate-limit 429 responses by stopping the replay', async () => {
    expect(replay.session?.segmentId).toBe(0);
    jest.spyOn(replay, 'stop');

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

    expect(replay.stop).toHaveBeenCalledTimes(1);

    // No user activity to trigger an update
    expect(replay.session).toBe(undefined);

    // let's simulate the default rate-limit time of inactivity (60secs) and check that we
    // don't do anything in the meantime or after the time has passed
    // 60secs are the default we fall back to in the plain 429 case in updateRateLimits()

    // T = base + 60
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY * 12);

    expect(mockSendReplayRequest).toHaveBeenCalledTimes(1);
    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    // and let's also emit a new event and check that it is not recorded
    const TEST_EVENT3 = {
      data: {},
      timestamp: BASE_TIMESTAMP + 7 * DEFAULT_FLUSH_MIN_DELAY,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT3);

    // T = base + 80
    await advanceTimers(20_000);
    expect(mockSendReplayRequest).toHaveBeenCalledTimes(1);
    expect(mockTransportSend).toHaveBeenCalledTimes(1);
  });
});
