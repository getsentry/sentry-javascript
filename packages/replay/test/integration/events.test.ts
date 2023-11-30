import { getClient } from '@sentry/core';

import { WINDOW } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { addEvent } from '../../src/util/addEvent';
import { PerformanceEntryResource } from '../fixtures/performanceEntry/resource';
import type { RecordMock } from '../index';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { getTestEventCheckout } from '../utils/getTestEvent';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

describe('Integration | events', () => {
  let replay: ReplayContainer;
  let mockRecord: RecordMock;
  let mockTransportSend: jest.SpyInstance<any>;
  const prevLocation = WINDOW.location;

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest.runAllTimers();
  });

  beforeEach(async () => {
    ({ mockRecord, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    }));

    mockTransportSend = jest.spyOn(getClient()!.getTransport()!, 'send');

    // Create a new session and clear mocks because a segment (from initial
    // checkout) will have already been uploaded by the time the tests run
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    mockTransportSend.mockClear();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
    clearSession(replay);
    jest.clearAllMocks();
    mockRecord.takeFullSnapshot.mockClear();
    replay.stop();
  });

  it('does not create replay event when there are no events to send', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = getTestEventCheckout({
      timestamp: BASE_TIMESTAMP + ELAPSED,
    });

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        urls: ['http://localhost/'], // this doesn't truly test if we are capturing the right URL as we don't change URLs, but good enough
      }),
    });
  });

  it('has correct timestamps when there are events earlier than initial timestamp', async function () {
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    mockTransportSend.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = getTestEventCheckout({
      timestamp: BASE_TIMESTAMP + ELAPSED,
    });

    addEvent(replay, TEST_EVENT);

    // Add a fake event that started BEFORE
    addEvent(replay, {
      data: {},
      timestamp: (BASE_TIMESTAMP - 10000) / 1000,
      type: 5,
    });

    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: (BASE_TIMESTAMP - 10000) / 1000,
        urls: ['http://localhost/'], // this doesn't truly test if we are capturing the right URL as we don't change URLs, but good enough
      }),
    });
  });

  it('does not have stale `replay_start_timestamp` due to an old time origin', async function () {
    const ELAPSED = 86400000 * 2; // 2 days
    // Add a mock performance event that happens 2 days ago. This can happen in the browser
    // when a tab has sat idle for a long period and user comes back to it.
    //
    // We pass a negative start time as it's a bit difficult to mock
    // `@sentry/utils/browserPerformanceTimeOrigin`. This would not happen in
    // real world.
    replay.performanceEntries.push(
      PerformanceEntryResource({
        startTime: -ELAPSED,
      }),
    );

    // This should be null because `addEvent` has not been called yet
    expect(replay.eventBuffer?.getEarliestTimestamp()).toBe(null);
    expect(mockTransportSend).toHaveBeenCalledTimes(0);

    // A new checkout occurs (i.e. a new session was started)
    const TEST_EVENT = getTestEventCheckout({
      timestamp: BASE_TIMESTAMP,
    });

    addEvent(replay, TEST_EVENT);
    // This event will trigger a flush
    WINDOW.dispatchEvent(new Event('blur'));
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockTransportSend).toHaveBeenCalledTimes(1);
    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        // Make sure the old performance event is thrown out
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
      }),
      recordingData: JSON.stringify([
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP / 1000,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.blur',
            },
          },
        },
      ]),
    });

    // This gets reset after sending replay
    expect(replay.eventBuffer?.getEarliestTimestamp()).toBe(null);
  });
});
