import { getClient } from '@sentry/core';
import type { Transport } from '@sentry/types';

import {
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_REPLAY_DURATION,
  REPLAY_SESSION_KEY,
  SESSION_IDLE_EXPIRE_DURATION,
  SESSION_IDLE_PAUSE_DURATION,
  WINDOW,
} from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { Session } from '../../src/types';
import { addEvent } from '../../src/util/addEvent';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import { createOptionsEvent } from '../../src/util/handleRecordingEmit';
import { BASE_TIMESTAMP } from '../index';
import type { RecordMock } from '../mocks/mockRrweb';
import { resetSdkMock } from '../mocks/resetSdkMock';
import type { DomHandler } from '../types';
import { getTestEventCheckout, getTestEventIncremental } from '../utils/getTestEvent';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

const prevLocation = WINDOW.location;

describe('Integration | session', () => {
  let replay: ReplayContainer;
  let domHandler: DomHandler;
  let mockRecord: RecordMock;

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    }));

    const mockTransport = getClient()?.getTransport()?.send as jest.MockedFunction<Transport['send']>;
    mockTransport?.mockClear();
  });

  afterEach(async () => {
    replay.stop();

    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));

    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
  });

  // Require a "user interaction" to start a new session, visibility is not enough. This can be noisy
  // (e.g. rapidly switching tabs/window focus) and leads to empty sessions.
  it('does not create a new session when document becomes visible after [SESSION_IDLE_EXPIRE_DURATION]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = { ...replay.session } as Session;

    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);
  });

  it('does not create a new session when document becomes focused after [SESSION_IDLE_EXPIRE_DURATION]ms', () => {
    const initialSession = { ...replay.session } as Session;

    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION + 1);

    WINDOW.dispatchEvent(new Event('focus'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);
  });

  it('does not create a new session if user hides the tab and comes back within [SESSION_IDLE_EXPIRE_DURATION] seconds', () => {
    const initialSession = { ...replay.session } as Session;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);

    // User comes back before `SESSION_IDLE_EXPIRE_DURATION` elapses
    jest.advanceTimersByTime(SESSION_IDLE_EXPIRE_DURATION - 1);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    // Should NOT have created a new session
    expect(replay).toHaveSameSession(initialSession);
  });

  it('creates a new session if user has been idle for more than SESSION_IDLE_EXPIRE_DURATION and comes back to click their mouse', async () => {
    const initialSession = { ...replay.session } as Session;

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(initialSession?.id).toBeDefined();
    expect(replay.getContext()).toEqual(
      expect.objectContaining({
        initialUrl: 'http://localhost/',
        initialTimestamp: BASE_TIMESTAMP,
      }),
    );

    const url = 'http://dummy/';
    Object.defineProperty(WINDOW, 'location', {
      value: new URL(url),
    });

    const ELAPSED = SESSION_IDLE_EXPIRE_DURATION + 1;
    jest.advanceTimersByTime(ELAPSED);

    // Session has become in an idle state
    //
    // This event will put the Replay SDK into a paused state
    const TEST_EVENT = getTestEventIncremental({
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
    });
    mockRecord._emitter(TEST_EVENT);

    // performance events can still be collected while recording is stopped
    // TODO: we may want to prevent `addEvent` from adding to buffer when user is inactive
    replay.addUpdate(() => {
      createPerformanceSpans(replay, [
        {
          type: 'navigation.navigate' as const,
          name: 'foo',
          start: BASE_TIMESTAMP + ELAPSED,
          end: BASE_TIMESTAMP + ELAPSED + 100,
          data: {
            decodedBodySize: 1,
            encodedBodySize: 2,
            duration: 0,
            domInteractive: 0,
            domContentLoadedEventEnd: 0,
            domContentLoadedEventStart: 0,
            loadEventStart: 0,
            loadEventEnd: 0,
            domComplete: 0,
            redirectCount: 0,
            size: 0,
          },
        },
      ]);
      return true;
    });

    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isPaused()).toBe(true);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);
    expect(mockRecord).toHaveBeenCalledTimes(1);

    // Now do a click which will create a new session and start recording again
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    const optionsEvent = createOptionsEvent(replay);

    await new Promise(process.nextTick);

    // This is not called because we have to start recording
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(mockRecord).toHaveBeenCalledTimes(2);

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    // Replay does not send immediately because checkout was due to expired session
    expect(replay).not.toHaveLastSentReplay();

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    await new Promise(process.nextTick);

    const newTimestamp = BASE_TIMESTAMP + ELAPSED + 20;

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        optionsEvent,
        // the click is lost, but that's OK
      ]),
    });

    // Earliest event is reset
    expect(replay.eventBuffer?.getEarliestTimestamp()).toBeNull();

    // `_context` should be reset when a new session is created
    expect(replay.getContext()).toEqual({
      initialUrl: 'http://dummy/',
      initialTimestamp: newTimestamp,
      urls: [],
      errorIds: new Set(),
      traceIds: new Set(),
    });
  });

  it('pauses and resumes a session if user has been idle for more than SESSION_IDLE_PASUE_DURATION and comes back to click their mouse', async () => {
    const initialSession = { ...replay.session } as Session;

    expect(initialSession?.id).toBeDefined();
    expect(replay.getContext()).toEqual(
      expect.objectContaining({
        initialUrl: 'http://localhost/',
        initialTimestamp: BASE_TIMESTAMP,
      }),
    );

    const url = 'http://dummy/';
    Object.defineProperty(WINDOW, 'location', {
      value: new URL(url),
    });

    const ELAPSED = SESSION_IDLE_PAUSE_DURATION + 1;
    jest.advanceTimersByTime(ELAPSED);

    // Session has become in an idle state
    //
    // This event will put the Replay SDK into a paused state
    const TEST_EVENT = getTestEventIncremental({
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
    });
    mockRecord._emitter(TEST_EVENT);

    // performance events can still be collected while recording is stopped
    // TODO: we may want to prevent `addEvent` from adding to buffer when user is inactive
    replay.addUpdate(() => {
      createPerformanceSpans(replay, [
        {
          type: 'navigation.navigate' as const,
          name: 'foo',
          start: BASE_TIMESTAMP + ELAPSED,
          end: BASE_TIMESTAMP + ELAPSED + 100,
          data: {
            decodedBodySize: 1,
            encodedBodySize: 2,
            duration: 0,
            domInteractive: 0,
            domContentLoadedEventEnd: 0,
            domContentLoadedEventStart: 0,
            loadEventStart: 0,
            loadEventEnd: 0,
            domComplete: 0,
            redirectCount: 0,
            size: 0,
          },
        },
      ]);
      return true;
    });

    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isPaused()).toBe(true);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);
    expect(mockRecord).toHaveBeenCalledTimes(1);

    // Now do a click which will create a new session and start recording again
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // Should be same session
    expect(replay).toHaveSameSession(initialSession);

    // Replay does not send immediately
    expect(replay).not.toHaveLastSentReplay();

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(replay).toHaveLastSentReplay();
  });

  it('should have a session after setup', () => {
    expect(replay.session).toMatchObject({
      lastActivity: BASE_TIMESTAMP,
      started: BASE_TIMESTAMP,
    });
    expect(replay.session?.id).toBeDefined();
    expect(replay.session?.segmentId).toBeDefined();
  });

  it('clears session', () => {
    clearSession(replay);
    expect(WINDOW.sessionStorage.getItem(REPLAY_SESSION_KEY)).toBe(null);
    expect(replay.session).toBe(undefined);
  });

  it('creates a new session if current session exceeds MAX_REPLAY_DURATION', async () => {
    jest.clearAllMocks();

    const initialSession = { ...replay.session } as Session;

    expect(initialSession?.id).toBeDefined();
    expect(replay.getContext()).toEqual(
      expect.objectContaining({
        initialUrl: 'http://localhost/',
        initialTimestamp: BASE_TIMESTAMP,
      }),
    );

    const url = 'http://dummy/';
    Object.defineProperty(WINDOW, 'location', {
      value: new URL(url),
    });

    // Advanced past MAX_REPLAY_DURATION
    const ELAPSED = MAX_REPLAY_DURATION + 1;
    jest.advanceTimersByTime(ELAPSED);
    // Update activity so as to not consider session to be idling
    replay['_updateUserActivity']();
    replay['_updateSessionActivity']();

    // This should trigger a new session
    const TEST_EVENT = getTestEventIncremental({
      data: { name: 'lost event' },
      timestamp: ELAPSED,
    });
    mockRecord._emitter(TEST_EVENT);

    const optionsEvent = createOptionsEvent(replay);
    const timestampAtRefresh = BASE_TIMESTAMP + ELAPSED;

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveSameSession(initialSession);
    expect(replay).not.toHaveLastSentReplay();
    expect(replay['_stopRecording']).toBeDefined();

    // Now do a click
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // 20 is for the process.nextTick
    const newTimestamp = timestampAtRefresh + 20;

    const NEW_TEST_EVENT = getTestEventIncremental({
      data: { name: 'test' },
      timestamp: newTimestamp + DEFAULT_FLUSH_MIN_DELAY + 20,
    });
    mockRecord._emitter(NEW_TEST_EVENT);

    jest.runAllTimers();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + ELAPSED, type: 2 },
        optionsEvent,
        {
          type: 5,
          timestamp: newTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: newTimestamp / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
        NEW_TEST_EVENT,
      ]),
    });

    // `_context` should be reset when a new session is created
    expect(replay.getContext()).toEqual(
      expect.objectContaining({
        initialUrl: 'http://dummy/',
        initialTimestamp: timestampAtRefresh,
      }),
    );
  });

  it('increases segment id after each event', async () => {
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP });

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
    });
    expect(replay.session?.segmentId).toBe(1);

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay.session?.segmentId).toBe(2);
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
    });
  });
});
