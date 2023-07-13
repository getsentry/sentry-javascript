import { captureException } from '@sentry/core';

import {
  BUFFER_CHECKOUT_TIME,
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
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

  // This tests a regression where we were calling flush indiscriminantly in `stop()`
  it('does not upload a replay event if error is not sampled', async () => {
    // We are trying to replicate the case where error rate is 0 and session
    // rate is > 0
    replay.stop();
    replay['_initializeSession']('buffer');

    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
  });

  it('does not send a replay when triggering a full dom snapshot when document becomes visible after 60s', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    jest.advanceTimersByTime(60 * 1000);

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

    jest.advanceTimersByTime(60 * 1000);
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

  it('stops & restarts replay if session had an error and exceeds MAX_SESSION_LIFE', async () => {
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

    const sessionId1 = replay.getSessionId();

    // Idle for given time
    jest.advanceTimersByTime(MAX_SESSION_LIFE + 1);
    await new Promise(process.nextTick);

    const TEST_EVENT = {
      data: { name: 'new session event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    const sessionId2 = replay.getSessionId();
    // Session has changed
    expect(sessionId2).not.toBe(sessionId1);
    expect(replay.recordingMode).toBe('buffer');

    captureException(new Error('testing'));

    await waitForBufferFlush();

    // sent a new session
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        replay_type: 'buffer',
        replay_id: sessionId2,
      }),
    });

    expect(replay.isEnabled()).toBe(true);
  });

  it('continues buffering replay if session had no error and exceeds MAX_SESSION_LIFE', async () => {
    const oldSessionId = replay.session?.id;
    expect(oldSessionId).toBeDefined();

    expect(replay).not.toHaveLastSentReplay();

    // Idle for given time
    jest.advanceTimersByTime(MAX_SESSION_LIFE + 1);
    await new Promise(process.nextTick);

    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);

    jest.runAllTimers();
    await new Promise(process.nextTick);

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

    expect(replay.session?.started).toBe(BASE_TIMESTAMP + ELAPSED + TICK + TICK);

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

  it('does not pause/expire session while buffering', async () => {
    jest.setSystemTime(BASE_TIMESTAMP);

    // Wait for session to expire
    jest.advanceTimersByTime(MAX_SESSION_LIFE + 1);
    await new Promise(process.nextTick);

    expect(replay.isPaused()).toBe(false);
    expect(replay.isEnabled()).toBe(true);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    captureException(new Error('testing'));

    await waitForBufferFlush();

    expect(replay).toHaveLastSentReplay();
  });
});

/**
 * This is testing a case that should only happen with error-only sessions.
 * Previously we had assumed that loading a session from session storage meant
 * that the session was not new. However, this is not the case with error-only
 * sampling since we can load a saved session that did not have an error (and
 * thus no replay was created).
 */
it('Integration | errorSampleRate | sends a replay after loading the session from storage', async () => {
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
      replaysSessionSampleRate: 0,
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
