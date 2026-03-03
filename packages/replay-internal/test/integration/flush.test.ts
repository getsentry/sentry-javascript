/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import * as SentryUtils from '@sentry/core';
import * as SentryBrowserUtils from '@sentry-internal/browser-utils';
import type { MockedFunction } from 'vitest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLUSH_MIN_DELAY, MAX_REPLAY_DURATION, WINDOW } from '../../src/constants';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { EventBuffer } from '../../src/types';
import { createPerformanceEntries } from '../../src/util/createPerformanceEntries';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import { debug } from '../../src/util/logger';
import * as SendReplay from '../../src/util/sendReplay';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '../index';
import type { DomHandler } from '../types';
import { getTestEventCheckout } from '../utils/getTestEvent';

type MockSendReplay = MockedFunction<any>;
type MockAddPerformanceEntries = MockedFunction<ReplayContainer['_addPerformanceEntries']>;
type MockEventBufferFinish = MockedFunction<EventBuffer['finish']>;
type MockFlush = MockedFunction<ReplayContainer['_flush']>;
type MockRunFlush = MockedFunction<ReplayContainer['_runFlush']>;

const prevLocation = WINDOW.location;
const prevBrowserPerformanceTimeOrigin = SentryUtils.browserPerformanceTimeOrigin;

describe('Integration | flush', () => {
  let domHandler: DomHandler;

  const { record: mockRecord } = mockRrweb();

  let integration: Replay;
  let replay: ReplayContainer;
  let mockSendReplay: MockSendReplay;
  let mockFlush: MockFlush;
  let mockRunFlush: MockRunFlush;
  let mockEventBufferFinish: MockEventBufferFinish;
  let mockAddPerformanceEntries: MockAddPerformanceEntries;

  beforeAll(async () => {
    vi.useFakeTimers();
    vi.spyOn(SentryBrowserUtils, 'addClickKeypressInstrumentationHandler').mockImplementation(handler => {
      domHandler = handler;
    });

    ({ replay, integration } = await mockSdk());

    mockSendReplay = vi.spyOn(SendReplay, 'sendReplay');
    mockSendReplay.mockImplementation(
      vi.fn(async () => {
        return;
      }),
    );

    // @ts-expect-error private API
    mockFlush = vi.spyOn(replay, '_flush');

    // @ts-expect-error private API
    mockRunFlush = vi.spyOn(replay, '_runFlush');

    // @ts-expect-error private API
    mockAddPerformanceEntries = vi.spyOn(replay, '_addPerformanceEntries');

    mockAddPerformanceEntries.mockImplementation(async () => {
      return [];
    });
  });

  beforeEach(async () => {
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.eventBuffer?.destroy();
    vi.clearAllMocks();

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    if (replay.eventBuffer) {
      vi.spyOn(replay.eventBuffer, 'finish');
    }
    mockEventBufferFinish = replay.eventBuffer?.finish as MockEventBufferFinish;
    mockEventBufferFinish.mockClear();

    Object.defineProperty(SentryUtils, 'browserPerformanceTimeOrigin', {
      value: () => BASE_TIMESTAMP,
      writable: true,
    });
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
    mockRecord.takeFullSnapshot.mockClear();
    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
    Object.defineProperty(SentryUtils, 'browserPerformanceTimeOrigin', {
      value: () => prevBrowserPerformanceTimeOrigin,
      writable: true,
    });
  });

  afterAll(() => {
    replay?.stop();
  });

  it('flushes twice after multiple flush() calls)', async () => {
    // blur events cause an immediate flush (as well as a flush due to adding a
    // breadcrumb) -- this means that the first blur event will be flushed and
    // the following blur events will all call a debounced flush function, which
    // should end up queueing a second flush

    WINDOW.dispatchEvent(new Event('blur'));
    WINDOW.dispatchEvent(new Event('blur'));
    WINDOW.dispatchEvent(new Event('blur'));
    WINDOW.dispatchEvent(new Event('blur'));

    expect(mockFlush).toHaveBeenCalledTimes(4);

    expect(mockRunFlush).toHaveBeenCalledTimes(1);

    await vi.advanceTimersToNextTimerAsync();
    expect(mockRunFlush).toHaveBeenCalledTimes(2);

    await vi.advanceTimersToNextTimerAsync();
    expect(mockRunFlush).toHaveBeenCalledTimes(2);
  });

  it('long first flush enqueues following events', async () => {
    // Mock this to resolve after 20 seconds so that we can queue up following flushes
    mockAddPerformanceEntries.mockImplementationOnce(() => {
      return new Promise(resolve => setTimeout(resolve, 20000));
    });

    expect(mockAddPerformanceEntries).not.toHaveBeenCalled();

    // flush #1 @ t=0s - due to blur
    WINDOW.dispatchEvent(new Event('blur'));
    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockRunFlush).toHaveBeenCalledTimes(1);

    // This will attempt to flush in 5 seconds (flushMinDelay)
    domHandler({
      name: 'click',
      event: new Event('click'),
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);
    // flush #2 @ t=5s - due to click
    expect(mockFlush).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    // flush #3 @ t=6s - due to blur
    WINDOW.dispatchEvent(new Event('blur'));
    expect(mockFlush).toHaveBeenCalledTimes(3);

    // NOTE: Blur also adds a breadcrumb which calls `addUpdate`, meaning it will
    // flush after `flushMinDelay`, but this gets cancelled by the blur
    await vi.advanceTimersByTimeAsync(8000);
    expect(mockFlush).toHaveBeenCalledTimes(3);

    // flush #4 @ t=14s - due to blur
    WINDOW.dispatchEvent(new Event('blur'));
    expect(mockFlush).toHaveBeenCalledTimes(4);

    expect(mockRunFlush).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000);
    // t=20s
    // addPerformanceEntries is finished, `flushLock` promise is resolved, calls
    // debouncedFlush, which will call `flush` in 1 second
    expect(mockFlush).toHaveBeenCalledTimes(4);
    // sendReplay is called with replayId, events, segment

    expect(mockSendReplay).toHaveBeenLastCalledWith({
      recordingData: expect.any(String),
      replayId: expect.any(String),
      segmentId: 0,
      eventContext: expect.anything(),
      session: expect.any(Object),
      timestamp: expect.any(Number),
      onError: expect.any(Function),
    });

    // Add this to test that segment ID increases
    mockAddPerformanceEntries.mockImplementationOnce(() =>
      Promise.all(
        createPerformanceSpans(
          replay,
          createPerformanceEntries([
            {
              name: 'https://sentry.io/foo.js',
              entryType: 'resource',
              startTime: 176.59999990463257,
              duration: 5.600000023841858,
              initiatorType: 'link',
              nextHopProtocol: 'h2',
              workerStart: 177.5,
              redirectStart: 0,
              redirectEnd: 0,
              fetchStart: 177.69999992847443,
              domainLookupStart: 177.69999992847443,
              domainLookupEnd: 177.69999992847443,
              connectStart: 177.69999992847443,
              connectEnd: 177.69999992847443,
              secureConnectionStart: 177.69999992847443,
              requestStart: 177.5,
              responseStart: 181,
              responseEnd: 182.19999992847443,
              transferSize: 0,
              encodedBodySize: 0,
              decodedBodySize: 0,
              serverTiming: [],
            } as unknown as PerformanceResourceTiming,
          ]),
        ),
      ),
    );
    // flush #5 @ t=25s - debounced flush calls `flush`
    // 20s + `flushMinDelay` which is 5 seconds
    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(5);
    expect(mockRunFlush).toHaveBeenCalledTimes(2);
    expect(mockSendReplay).toHaveBeenLastCalledWith({
      recordingData: expect.any(String),
      replayId: expect.any(String),
      segmentId: 1,
      eventContext: expect.anything(),
      session: expect.any(Object),
      onError: expect.any(Function),
      timestamp: expect.any(Number),
    });

    // Make sure there's no other calls
    vi.runAllTimers();
    await new Promise(process.nextTick);
    expect(mockSendReplay).toHaveBeenCalledTimes(2);
  });

  it('has single flush when checkout flush and debounce flush happen near simultaneously', async () => {
    // click happens first
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // checkout
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP });
    mockRecord._emitter(TEST_EVENT);

    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);
    expect(mockFlush).toHaveBeenCalledTimes(1);

    // Make sure there's nothing queued up after
    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('does not flush if session is too short', async () => {
    replay.getOptions().minReplayDuration = 100_000;

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    // click happens first
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // checkout
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP });
    mockRecord._emitter(TEST_EVENT);

    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);

    // it should re-schedule the flush, so once the min. duration is reached it should automatically send it
    await vi.advanceTimersByTimeAsync(100_000 - DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(20);
    expect(mockSendReplay).toHaveBeenCalledTimes(1);

    replay.getOptions().minReplayDuration = 0;
  });

  it('does not flush if session is too long', async () => {
    replay.getOptions().maxReplayDuration = 100_000;
    vi.setSystemTime(BASE_TIMESTAMP);

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    // No-op _checkSession to avoid us resetting the session for this test
    const _tmp = replay['_checkSession'];
    replay['_checkSession'] = () => {
      return true;
    };

    await vi.advanceTimersByTimeAsync(120_000);

    // click happens first
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // checkout
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP });
    mockRecord._emitter(TEST_EVENT);

    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);

    replay.getOptions().maxReplayDuration = MAX_REPLAY_DURATION;
    replay['_checkSession'] = _tmp;
  });

  it('logs warning if flushing initial segment without checkout', async () => {
    debug.setConfig({ traceInternals: true });

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    await new Promise(process.nextTick);
    vi.setSystemTime(BASE_TIMESTAMP);

    // Clear the event buffer to simulate no checkout happened
    replay.eventBuffer!.clear();

    // click happens first
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // no checkout!
    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(1);

    const replayData = mockSendReplay.mock.calls?.[0]?.[0] as SentryUtils.ReplayRecordingData;

    expect(JSON.parse(replayData.recordingData)).toEqual([
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
      {
        type: 5,
        timestamp: BASE_TIMESTAMP,
        data: {
          tag: 'breadcrumb',
          payload: {
            timestamp: BASE_TIMESTAMP / 1000,
            type: 'default',
            category: 'console',
            data: { logger: 'replay' },
            level: 'info',
            message: '[Replay] Creating new session',
          },
        },
      },
      {
        type: 5,
        timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY,
        data: {
          tag: 'breadcrumb',
          payload: {
            timestamp: (BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY) / 1000,
            type: 'default',
            category: 'console',
            data: { logger: 'replay' },
            level: 'log',
            message: '[Replay] Flushing initial segment without checkout.',
          },
        },
      },
    ]);

    debug.setConfig({ traceInternals: false });
  });

  it('logs warning if adding event that is after maxReplayDuration', async () => {
    debug.setConfig({ traceInternals: true });

    const spyDebugLogger = vi.spyOn(SentryUtils.debug, 'log');

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    await new Promise(process.nextTick);
    vi.setSystemTime(BASE_TIMESTAMP);

    replay.eventBuffer!.clear();

    // We do not care about this warning here
    replay.eventBuffer!.hasCheckout = true;

    // Add event that is too long after session start
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP + MAX_REPLAY_DURATION + 100 });
    mockRecord._emitter(TEST_EVENT);

    // no checkout!
    await vi.advanceTimersByTimeAsync(DEFAULT_FLUSH_MIN_DELAY);

    // No flush is scheduled is aborted because event is after maxReplayDuration
    expect(mockFlush).toHaveBeenCalledTimes(0);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);

    expect(spyDebugLogger).toHaveBeenLastCalledWith(
      '[Replay] ',
      `Skipping event with timestamp ${
        BASE_TIMESTAMP + MAX_REPLAY_DURATION + 100
      } because it is after maxReplayDuration`,
    );

    debug.setConfig({ traceInternals: false });
    spyDebugLogger.mockRestore();
  });

  /**
   * This tests the case where a flush happens in time,
   * but something takes too long (e.g. because we are idle, ...)
   * so by the time we actually send the replay it's too late.
   * In this case, we want to stop the replay.
   */
  it('stops if flushing after maxReplayDuration', async () => {
    replay.getOptions().maxReplayDuration = 100_000;

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    await new Promise(process.nextTick);
    vi.setSystemTime(BASE_TIMESTAMP);

    replay.eventBuffer!.clear();

    // We do not care about this warning here
    replay.eventBuffer!.hasCheckout = true;

    // We want to simulate that flushing happens _way_ late
    replay['_addPerformanceEntries'] = () => {
      return new Promise(resolve => setTimeout(resolve, 140_000));
    };

    // Add event inside of session life timespan
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP + 100 });
    mockRecord._emitter(TEST_EVENT);

    await vi.advanceTimersByTimeAsync(160_000);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);

    replay.getOptions().maxReplayDuration = MAX_REPLAY_DURATION;

    // Start again for following tests
    await replay.start();
  });

  /**
   * This tests that when a replay exceeds maxReplayDuration,
   * the dropped event is recorded with the 'invalid' reason
   * to distinguish it from actual send errors.
   */
  it('records dropped event with invalid reason when session exceeds maxReplayDuration', async () => {
    const client = SentryUtils.getClient()!;
    const recordDroppedEventSpy = vi.spyOn(client, 'recordDroppedEvent');

    replay.getOptions().maxReplayDuration = 100_000;

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    await new Promise(process.nextTick);
    vi.setSystemTime(BASE_TIMESTAMP);

    replay.eventBuffer!.clear();

    replay.eventBuffer!.hasCheckout = true;

    replay['_addPerformanceEntries'] = () => {
      return new Promise(resolve => setTimeout(resolve, 140_000));
    };

    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP + 100 });
    mockRecord._emitter(TEST_EVENT);

    await vi.advanceTimersByTimeAsync(160_000);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);

    expect(recordDroppedEventSpy).toHaveBeenCalledWith('invalid', 'replay');

    replay.getOptions().maxReplayDuration = MAX_REPLAY_DURATION;
    recordDroppedEventSpy.mockRestore();

    await replay.start();
  });

  it('resets flush lock if runFlush rejects/throws', async () => {
    mockRunFlush.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          reject(new Error('runFlush'));
        }),
    );
    try {
      await replay['_flush']();
    } catch {
      // do nothing
    }
    expect(replay['_flushLock']).toBeUndefined();
  });

  it('resets flush lock when flush is called multiple times before it resolves', async () => {
    let _resolve: undefined | (() => void);
    mockRunFlush.mockImplementation(
      () =>
        new Promise(resolve => {
          _resolve = resolve;
        }),
    );
    const mockDebouncedFlush = vi.spyOn(replay, '_debouncedFlush');
    mockDebouncedFlush.mockImplementation(vi.fn);
    mockDebouncedFlush.cancel = vi.fn();

    const results = [replay['_flush'](), replay['_flush']()];
    expect(replay['_flushLock']).not.toBeUndefined();

    _resolve?.();
    await Promise.all(results);
    expect(replay['_flushLock']).toBeUndefined();
    mockDebouncedFlush.mockRestore();
  });

  it('resets flush lock when flush is called multiple times before it rejects', async () => {
    let _reject: undefined | ((error: Error) => void);
    mockRunFlush.mockImplementation(
      () =>
        new Promise((_, reject) => {
          _reject = reject;
        }),
    );
    const mockDebouncedFlush: MockedFunction<ReplayContainer['_debouncedFlush']> = vi.spyOn(replay, '_debouncedFlush');
    mockDebouncedFlush.mockImplementation(vi.fn);
    mockDebouncedFlush.cancel = vi.fn();
    expect(replay['_flushLock']).toBeUndefined();
    replay['_flush']();
    const result = replay['_flush']();
    expect(replay['_flushLock']).not.toBeUndefined();

    _reject?.(new Error('Throw runFlush'));
    await result;
    expect(replay['_flushLock']).toBeUndefined();
    mockDebouncedFlush.mockRestore();
  });

  /**
   * Assuming the user wants to record a session
   * when calling flush() without replay being enabled
   */
  it('starts recording a session when replay is not enabled', () => {
    integration.stop();
    integration.flush();
    expect(replay.isEnabled()).toBe(true);
  });
});
