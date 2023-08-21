import { captureException, getCurrentHub } from '@sentry/core';

import {
  BUFFER_CHECKOUT_TIME,
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
  SESSION_IDLE_EXPIRE_DURATION,
  WINDOW,
} from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { addEvent } from '../../src/util/addEvent';
import { createOptionsEvent } from '../../src/util/handleRecordingEmit';
import { PerformanceEntryResource } from '../fixtures/performanceEntry/resource';
import type { RecordMock } from '../index';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';
import type { DomHandler } from '../types';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

async function waitForBufferFlush() {
  await new Promise(process.nextTick);
  await new Promise(process.nextTick);
}

async function waitForFlush() {
  await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
}

describe('Integration | errorSampleRate', () => {
  let replay: ReplayContainer;
  let mockRecord: RecordMock;
  let domHandler: DomHandler;

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));
  });

  afterEach(async () => {
    clearSession(replay);
    replay.stop();
  });

  it('uploads a replay when `Sentry.captureException` is called and continues recording', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    const optionsEvent = createOptionsEvent(replay);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    // Does not capture on mouse click
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    captureException(new Error('testing'));

    await waitForBufferFlush();

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        optionsEvent,
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    await waitForFlush();

    // This is from when we stop recording and start a session recording
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
      recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + 40, type: 2 }]),
    });

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);

    // Check that click will get captured
    domHandler({
      name: 'click',
    });

    await waitForFlush();

    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP + 10000 + 80,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: (BASE_TIMESTAMP + 10000 + 80) / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });
  });

  it('manually flushes replay and does not continue to record', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    const optionsEvent = createOptionsEvent(replay);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    // Does not capture on mouse click
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    replay.sendBufferedReplayOrFlush({ continueRecording: false });

    await waitForBufferFlush();

    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        optionsEvent,
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    // Check that click will not get captured
    domHandler({
      name: 'click',
    });

    await waitForFlush();

    // This is still the last replay sent since we passed `continueRecording:
    // false`.
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        optionsEvent,
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });
  });

  it('handles multiple simultaneous flushes', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    const optionsEvent = createOptionsEvent(replay);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    // Does not capture on mouse click
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    replay.sendBufferedReplayOrFlush({ continueRecording: true });
    replay.sendBufferedReplayOrFlush({ continueRecording: true });

    await waitForBufferFlush();

    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        optionsEvent,
        TEST_EVENT,
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    // Check that click will not get captured
    domHandler({
      name: 'click',
    });

    await waitForFlush();

    // This is still the last replay sent since we passed `continueRecording:
    // false`.
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
    });
  });

  // This tests a regression where we were calling flush indiscriminantly in `stop()`
  it('does not upload a replay event if error is not sampled', async () => {
    // We are trying to replicate the case where error rate is 0 and session
    // rate is > 0, we can't set them both to 0 otherwise
    // `_initializeSessionForSampling` is not called when initializing the plugin.
    replay.stop();
    replay['_options']['errorSampleRate'] = 0;
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not send a replay when triggering a full dom snapshot when document becomes visible after [SESSION_IDLE_EXPIRE_DURATION]ms', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not send a replay if user hides the tab and comes back within 60 seconds', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();

    // User comes back before `SESSION_IDLE_EXPIRE_DURATION` elapses
    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION - 100);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not upload a replay event when document becomes hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    addEvent(replay, TEST_EVENT);

    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not upload a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not upload a replay event if 15 seconds have elapsed since the last replay upload', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Fire a new event every 4 seconds, 4 times
    [...Array(4)].forEach(() => {
      mockRecord._emitter(TEST_EVENT);
      jest.advanceTimersByTime(4000);
    });

    // We are at time = +16seconds now (relative to BASE_TIMESTAMP)
    // The next event should cause an upload immediately
    mockRecord._emitter(TEST_EVENT);
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    await waitForFlush();
    expect(replay).not.toHaveLastSentReplay();

    // Let's make sure it continues to work
    mockRecord._emitter(TEST_EVENT);
    await waitForFlush();
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();
  });

  // When the error session records as a normal session, we want to stop
  // recording after the session ends. Otherwise, we get into a state where the
  // new session is a session type replay (this could conflict with the session
  // sample rate of 0.0), or an error session that has no errors. Instead we
  // simply stop the session replay completely and wait for a new page load to
  // resample.
  it.each([
    ['MAX_SESSION_LIFE', MAX_SESSION_LIFE],
    ['SESSION_IDLE_DURATION', SESSION_IDLE_EXPIRE_DURATION],
  ])(
    'stops replay if session had an error and exceeds %s and does not start a new session thereafter',
    async (_label, waitTime) => {
      expect(replay.session?.shouldRefresh).toBe(true);

      captureException(new Error('testing'));

      await waitForBufferFlush();

      expect(replay).toHaveLastSentReplay({
        recordingPayloadHeader: { segment_id: 0 },
        replayEventPayload: expect.objectContaining({
          replay_type: 'buffer',
        }),
      });

      await waitForFlush();

      // segment_id is 1 because it sends twice on error
      expect(replay).toHaveLastSentReplay({
        recordingPayloadHeader: { segment_id: 1 },
        replayEventPayload: expect.objectContaining({
          replay_type: 'buffer',
        }),
      });
      expect(replay.session?.shouldRefresh).toBe(false);

      // Idle for given time
      jest.advanceTimersByTime(waitTime + 1);
      await new Promise(process.nextTick);

      const TEST_EVENT = {
        data: { name: 'lost event' },
        timestamp: BASE_TIMESTAMP,
        type: 3,
      };
      mockRecord._emitter(TEST_EVENT);

      jest.runAllTimers();
      await new Promise(process.nextTick);

      // We stop recording after 15 minutes of inactivity in error mode

      // still no new replay sent
      expect(replay).toHaveLastSentReplay({
        recordingPayloadHeader: { segment_id: 1 },
        replayEventPayload: expect.objectContaining({
          replay_type: 'buffer',
        }),
      });

      expect(replay.isEnabled()).toBe(false);

      domHandler({
        name: 'click',
      });

      // Remains disabled!
      expect(replay.isEnabled()).toBe(false);
    },
  );

  it.each([
    ['MAX_SESSION_LIFE', MAX_SESSION_LIFE],
    ['SESSION_IDLE_EXPIRE_DURATION', SESSION_IDLE_EXPIRE_DURATION],
  ])('continues buffering replay if session had no error and exceeds %s', async (_label, waitTime) => {
    const oldSessionId = replay.session?.id;
    expect(oldSessionId).toBeDefined();

    expect(replay).not.toHaveLastSentReplay();

    // Idle for given time
    jest.advanceTimersByTime(waitTime + 1);
    await new Promise(process.nextTick);

    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // in production, this happens at a time interval, here we mock this
    mockRecord.takeFullSnapshot(true);

    // still no new replay sent
    expect(replay).not.toHaveLastSentReplay();

    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');

    domHandler({
      name: 'click',
    });

    await waitForFlush();

    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');

    // should still react to errors later on
    captureException(new Error('testing'));

    await waitForBufferFlush();

    expect(replay.session?.id).toBe(oldSessionId);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
    });

    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('session');
    expect(replay.session?.sampled).toBe('buffer');
    expect(replay.session?.shouldRefresh).toBe(false);
  });

  // Should behave the same as above test
  it('stops replay if user has been idle for more than SESSION_IDLE_EXPIRE_DURATION and does not start a new session thereafter', async () => {
    const oldSessionId = replay.session?.id;
    expect(oldSessionId).toBeDefined();

    // Idle for 15 minutes
    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION + 1);

    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // We stop recording after SESSION_IDLE_EXPIRE_DURATION of inactivity in error mode
    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');

    // should still react to errors later on
    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);
    expect(replay.session?.id).toBe(oldSessionId);

    // buffered events
    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
    });

    // `startRecording` full checkout
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
      }),
    });

    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('session');
    expect(replay.session?.sampled).toBe('buffer');
    expect(replay.session?.shouldRefresh).toBe(false);
  });

  it('has the correct timestamps with deferred root event and last replay update', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    const optionsEvent = createOptionsEvent(replay);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);

    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        optionsEvent,
        TEST_EVENT,
      ]),
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // the exception happens roughly 10 seconds after BASE_TIMESTAMP
        // (advance timers + waiting for flush after the checkout) and
        // extra time is likely due to async of `addMemoryEntry()`

        timestamp: (BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY + DEFAULT_FLUSH_MIN_DELAY + 40) / 1000,
        error_ids: [expect.any(String)],
        trace_ids: [],
        urls: ['http://localhost/'],
        replay_id: expect.any(String),
      }),
      recordingPayloadHeader: { segment_id: 0 },
    });
  });

  it('has correct timestamps when error occurs much later than initial pageload/checkout', async () => {
    const ELAPSED = BUFFER_CHECKOUT_TIME;
    const TICK = 20;
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    // add a mock performance event
    replay.performanceEvents.push(PerformanceEntryResource());

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.advanceTimersByTime(ELAPSED);

    // in production, this happens at a time interval
    // session started time should be updated to this current timestamp
    mockRecord.takeFullSnapshot(true);
    const optionsEvent = createOptionsEvent(replay);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();

    captureException(new Error('testing'));

    await waitForBufferFlush();

    // This is still the timestamp from the full snapshot we took earlier
    expect(replay.session?.started).toBe(BASE_TIMESTAMP + ELAPSED + TICK);

    // Does not capture mouse click
    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        // Make sure the old performance event is thrown out
        replay_start_timestamp: (BASE_TIMESTAMP + ELAPSED + TICK) / 1000,
      }),
      recordingData: JSON.stringify([
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + ELAPSED + TICK,
          type: 2,
        },
        optionsEvent,
      ]),
    });
  });

  it('stops replay when user goes idle', async () => {
    jest.setSystemTime(BASE_TIMESTAMP);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    captureException(new Error('testing'));

    await waitForBufferFlush();

    expect(replay).toHaveLastSentReplay();

    // Flush from calling `stopRecording`
    await waitForFlush();

    // Now wait after session expires - should stop recording
    mockRecord.takeFullSnapshot.mockClear();
    (getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>).mockClear();

    expect(replay).not.toHaveLastSentReplay();

    // Go idle
    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION + 1);
    await new Promise(process.nextTick);

    mockRecord._emitter(TEST_EVENT);

    expect(replay).not.toHaveLastSentReplay();

    await waitForFlush();

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);
  });

  it('stops replay when session exceeds max length after latest captured error', async () => {
    const sessionId = replay.session?.id;
    jest.setSystemTime(BASE_TIMESTAMP);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    jest.advanceTimersByTime(2 * MAX_SESSION_LIFE);

    // in production, this happens at a time interval, here we mock this
    mockRecord.takeFullSnapshot(true);

    captureException(new Error('testing'));

    // Flush due to exception
    await new Promise(process.nextTick);
    await waitForFlush();

    expect(replay.session?.id).toBe(sessionId);
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
    });

    // This comes from `startRecording()` in `sendBufferedReplayOrFlush()`
    await waitForFlush();
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
      recordingData: JSON.stringify([
        {
          data: {
            isCheckout: true,
          },
          timestamp: BASE_TIMESTAMP + 2 * MAX_SESSION_LIFE + DEFAULT_FLUSH_MIN_DELAY + 40,
          type: 2,
        },
      ]),
    });

    // Now wait after session expires - should stop recording
    mockRecord.takeFullSnapshot.mockClear();
    (getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>).mockClear();

    jest.advanceTimersByTime(MAX_SESSION_LIFE);
    await new Promise(process.nextTick);

    mockRecord._emitter(TEST_EVENT);
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);

    // Once the session is stopped after capturing a replay already
    // (buffer-mode), another error will not trigger a new replay
    captureException(new Error('testing'));

    await new Promise(process.nextTick);
    jest.advanceTimersByTime(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not stop replay based on earliest event in buffer', async () => {
    jest.setSystemTime(BASE_TIMESTAMP);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP - 60000, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    captureException(new Error('testing'));

    await waitForBufferFlush();

    expect(replay).toHaveLastSentReplay();

    // Flush from calling `stopRecording`
    await waitForFlush();

    // Now wait after session expires - should stop recording
    mockRecord.takeFullSnapshot.mockClear();
    (getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>).mockClear();

    expect(replay).not.toHaveLastSentReplay();

    const TICKS = 80;

    // We advance time so that we are on the border of expiring, taking into
    // account that TEST_EVENT timestamp is 60000 ms before BASE_TIMESTAMP. The
    // 3 DEFAULT_FLUSH_MIN_DELAY is to account for the `waitForFlush` that has
    // happened, and for the next two that will happen. The first following
    // `waitForFlush` does not expire session, but the following one will.
    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION - 60000 - 3 * DEFAULT_FLUSH_MIN_DELAY - TICKS);
    await new Promise(process.nextTick);

    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveLastSentReplay();
    await waitForFlush();

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(true);

    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveLastSentReplay();
    await waitForFlush();

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(true);

    // It's hard to test, but if we advance the below time less 1 ms, it should
    // be enabled, but we can't trigger a session check via flush without
    // incurring another DEFAULT_FLUSH_MIN_DELAY timeout.
    jest.advanceTimersByTime(60000 - DEFAULT_FLUSH_MIN_DELAY);
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveLastSentReplay();
    await waitForFlush();

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);
  });

  it('handles very long active buffer session', async () => {
    const stepDuration = 10_000;
    const steps = 5_000;

    jest.setSystemTime(BASE_TIMESTAMP);

    expect(replay).not.toHaveLastSentReplay();

    let optionsEvent = createOptionsEvent(replay);

    for (let i = 1; i <= steps; i++) {
      jest.advanceTimersByTime(stepDuration);
      optionsEvent = createOptionsEvent(replay);
      mockRecord._emitter({ data: { step: i }, timestamp: BASE_TIMESTAMP + stepDuration * i, type: 2 }, true);
      mockRecord._emitter({ data: { step: i }, timestamp: BASE_TIMESTAMP + stepDuration * i + 5, type: 3 });
    }

    expect(replay).not.toHaveLastSentReplay();

    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');

    // Now capture an error
    captureException(new Error('testing'));
    await waitForBufferFlush();

    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([
        { data: { step: steps }, timestamp: BASE_TIMESTAMP + stepDuration * steps, type: 2 },
        optionsEvent,
        { data: { step: steps }, timestamp: BASE_TIMESTAMP + stepDuration * steps + 5, type: 3 },
      ]),
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: (BASE_TIMESTAMP + stepDuration * steps) / 1000,
        error_ids: [expect.any(String)],
        trace_ids: [],
        urls: ['http://localhost/'],
        replay_id: expect.any(String),
      }),
      recordingPayloadHeader: { segment_id: 0 },
    });
  });
});

/**
 * If an error happens, we switch the recordingMode to `session`, set `shouldRefresh=false` on the session,
 * but keep `sampled=buffer`.
 * This test should verify that if we load such a session from sessionStorage, the session is eventually correctly ended.
 */
it('handles buffer sessions that previously had an error', async () => {
  // Pretend that a session is already saved before loading replay
  WINDOW.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    `{"segmentId":0,"id":"fd09adfc4117477abc8de643e5a5798a","sampled":"buffer","started":${BASE_TIMESTAMP},"lastActivity":${BASE_TIMESTAMP},"shouldRefresh":false}`,
  );
  const { mockRecord, replay, integration } = await resetSdkMock({
    replayOptions: {
      stickySession: true,
    },
    sentryOptions: {
      replaysOnErrorSampleRate: 1.0,
    },
    autoStart: false,
  });
  integration['_initialize']();

  jest.runAllTimers();

  await new Promise(process.nextTick);
  const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
  mockRecord._emitter(TEST_EVENT);

  expect(replay).not.toHaveLastSentReplay();

  // Waiting for max life should eventually stop recording
  // We simulate a full checkout which would otherwise be done automatically
  for (let i = 0; i < MAX_SESSION_LIFE / 60_000; i++) {
    jest.advanceTimersByTime(60_000);
    await new Promise(process.nextTick);
    mockRecord.takeFullSnapshot(true);
  }

  expect(replay).not.toHaveLastSentReplay();
  expect(replay.isEnabled()).toBe(false);
});

it('handles buffer sessions that never had an error', async () => {
  // Pretend that a session is already saved before loading replay
  WINDOW.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    `{"segmentId":0,"id":"fd09adfc4117477abc8de643e5a5798a","sampled":"buffer","started":${BASE_TIMESTAMP},"lastActivity":${BASE_TIMESTAMP}}`,
  );
  const { mockRecord, replay, integration } = await resetSdkMock({
    replayOptions: {
      stickySession: true,
    },
    sentryOptions: {
      replaysOnErrorSampleRate: 1.0,
    },
    autoStart: false,
  });
  integration['_initialize']();

  jest.runAllTimers();

  await new Promise(process.nextTick);
  const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
  mockRecord._emitter(TEST_EVENT);

  expect(replay).not.toHaveLastSentReplay();

  // Waiting for max life should eventually stop recording
  // We simulate a full checkout which would otherwise be done automatically
  for (let i = 0; i < MAX_SESSION_LIFE / 60_000; i++) {
    jest.advanceTimersByTime(60_000);
    await new Promise(process.nextTick);
    mockRecord.takeFullSnapshot(true);
  }

  expect(replay).not.toHaveLastSentReplay();
  expect(replay.isEnabled()).toBe(true);
});

/**
 * This is testing a case that should only happen with error-only sessions.
 * Previously we had assumed that loading a session from session storage meant
 * that the session was not new. However, this is not the case with error-only
 * sampling since we can load a saved session that did not have an error (and
 * thus no replay was created).
 */
it('sends a replay after loading the session from storage', async () => {
  // Pretend that a session is already saved before loading replay
  WINDOW.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    `{"segmentId":0,"id":"fd09adfc4117477abc8de643e5a5798a","sampled":"buffer","started":${BASE_TIMESTAMP},"lastActivity":${BASE_TIMESTAMP}}`,
  );
  const { mockRecord, replay, integration } = await resetSdkMock({
    replayOptions: {
      stickySession: true,
    },
    sentryOptions: {
      replaysOnErrorSampleRate: 1.0,
    },
    autoStart: false,
  });
  integration['_initialize']();
  const optionsEvent = createOptionsEvent(replay);

  jest.runAllTimers();

  await new Promise(process.nextTick);
  const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
  mockRecord._emitter(TEST_EVENT);

  expect(replay).not.toHaveLastSentReplay();

  captureException(new Error('testing'));

  // 2 ticks to send replay from an error
  await waitForBufferFlush();

  // Buffered events before error
  expect(replay).toHaveSentReplay({
    recordingPayloadHeader: { segment_id: 0 },
    recordingData: JSON.stringify([
      { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
      optionsEvent,
      TEST_EVENT,
    ]),
  });

  // `startRecording()` after switching to session mode to continue recording
  await waitForFlush();

  // Latest checkout when we call `startRecording` again after uploading segment
  // after an error occurs (e.g. when we switch to session replay recording)
  expect(replay).toHaveLastSentReplay({
    recordingPayloadHeader: { segment_id: 1 },
    recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + 40, type: 2 }]),
  });
});
