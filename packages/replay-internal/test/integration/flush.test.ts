import * as SentryBrowserUtils from '@sentry-internal/browser-utils';
import * as SentryUtils from '@sentry/utils';

import { DEFAULT_FLUSH_MIN_DELAY, MAX_REPLAY_DURATION, WINDOW } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { EventBuffer } from '../../src/types';
import * as AddMemoryEntry from '../../src/util/addMemoryEntry';
import { createPerformanceEntries } from '../../src/util/createPerformanceEntries';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import * as SendReplay from '../../src/util/sendReplay';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '../index';
import type { DomHandler } from '../types';
import { getTestEventCheckout } from '../utils/getTestEvent';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockSendReplay = jest.MockedFunction<any>;
type MockAddPerformanceEntries = jest.MockedFunction<ReplayContainer['_addPerformanceEntries']>;
type MockAddMemoryEntry = jest.SpyInstance;
type MockEventBufferFinish = jest.MockedFunction<EventBuffer['finish']>;
type MockFlush = jest.MockedFunction<ReplayContainer['_flush']>;
type MockRunFlush = jest.MockedFunction<ReplayContainer['_runFlush']>;

const prevLocation = WINDOW.location;
const prevBrowserPerformanceTimeOrigin = SentryUtils.browserPerformanceTimeOrigin;

describe('Integration | flush', () => {
  let domHandler: DomHandler;

  const { record: mockRecord } = mockRrweb();

  let replay: ReplayContainer;
  let mockSendReplay: MockSendReplay;
  let mockFlush: MockFlush;
  let mockRunFlush: MockRunFlush;
  let mockEventBufferFinish: MockEventBufferFinish;
  let mockAddMemoryEntry: MockAddMemoryEntry;
  let mockAddPerformanceEntries: MockAddPerformanceEntries;

  beforeAll(async () => {
    jest.spyOn(SentryBrowserUtils, 'addClickKeypressInstrumentationHandler').mockImplementation(handler => {
      domHandler = handler;
    });

    ({ replay } = await mockSdk());

    mockSendReplay = jest.spyOn(SendReplay, 'sendReplay');
    mockSendReplay.mockImplementation(
      jest.fn(async () => {
        return;
      }),
    );

    // @ts-expect-error private API
    mockFlush = jest.spyOn(replay, '_flush');

    // @ts-expect-error private API
    mockRunFlush = jest.spyOn(replay, '_runFlush');

    // @ts-expect-error private API
    mockAddPerformanceEntries = jest.spyOn(replay, '_addPerformanceEntries');

    mockAddPerformanceEntries.mockImplementation(async () => {
      return [];
    });

    mockAddMemoryEntry = jest.spyOn(AddMemoryEntry, 'addMemoryEntry');
  });

  beforeEach(() => {
    jest.runAllTimers();
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockSendReplay.mockClear();
    replay.eventBuffer?.destroy();
    mockAddPerformanceEntries.mockClear();
    mockFlush.mockClear();
    mockRunFlush.mockClear();
    mockAddMemoryEntry.mockClear();

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    if (replay.eventBuffer) {
      jest.spyOn(replay.eventBuffer, 'finish');
    }
    mockEventBufferFinish = replay.eventBuffer?.finish as MockEventBufferFinish;
    mockEventBufferFinish.mockClear();

    Object.defineProperty(SentryUtils, 'browserPerformanceTimeOrigin', {
      value: BASE_TIMESTAMP,
      writable: true,
    });
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockRecord.takeFullSnapshot.mockClear();
    Object.defineProperty(WINDOW, 'location', {
      value: prevLocation,
      writable: true,
    });
    Object.defineProperty(SentryUtils, 'browserPerformanceTimeOrigin', {
      value: prevBrowserPerformanceTimeOrigin,
      writable: true,
    });
  });

  afterAll(() => {
    replay && replay.stop();
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

    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(mockRunFlush).toHaveBeenCalledTimes(1);

    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(mockRunFlush).toHaveBeenCalledTimes(2);

    jest.runAllTimers();
    await new Promise(process.nextTick);
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
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    // flush #2 @ t=5s - due to click
    expect(mockFlush).toHaveBeenCalledTimes(2);

    await advanceTimers(1000);
    // flush #3 @ t=6s - due to blur
    WINDOW.dispatchEvent(new Event('blur'));
    expect(mockFlush).toHaveBeenCalledTimes(3);

    // NOTE: Blur also adds a breadcrumb which calls `addUpdate`, meaning it will
    // flush after `flushMinDelay`, but this gets cancelled by the blur
    await advanceTimers(8000);
    expect(mockFlush).toHaveBeenCalledTimes(3);

    // flush #4 @ t=14s - due to blur
    WINDOW.dispatchEvent(new Event('blur'));
    expect(mockFlush).toHaveBeenCalledTimes(4);

    expect(mockRunFlush).toHaveBeenCalledTimes(1);
    await advanceTimers(6000);
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
      options: expect.any(Object),
      timestamp: expect.any(Number),
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
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(5);
    expect(mockRunFlush).toHaveBeenCalledTimes(2);
    expect(mockSendReplay).toHaveBeenLastCalledWith({
      recordingData: expect.any(String),
      replayId: expect.any(String),
      segmentId: 1,
      eventContext: expect.anything(),
      session: expect.any(Object),
      options: expect.any(Object),
      timestamp: expect.any(Number),
    });

    // Make sure there's no other calls
    jest.runAllTimers();
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

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(mockFlush).toHaveBeenCalledTimes(1);

    // Make sure there's nothing queued up after
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
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

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);

    // it should re-schedule the flush, so once the min. duration is reached it should automatically send it
    await advanceTimers(100_000 - DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(20);
    expect(mockSendReplay).toHaveBeenCalledTimes(1);

    replay.getOptions().minReplayDuration = 0;
  });

  it('does not flush if session is too long', async () => {
    replay.getOptions().maxReplayDuration = 100_000;
    jest.setSystemTime(BASE_TIMESTAMP);

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();

    // No-op _checkSession to avoid us resetting the session for this test
    const _tmp = replay['_checkSession'];
    replay['_checkSession'] = () => {
      return true;
    };

    await advanceTimers(120_000);

    // click happens first
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // checkout
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);

    replay.getOptions().maxReplayDuration = MAX_REPLAY_DURATION;
    replay['_checkSession'] = _tmp;
  });

  it('logs warning if flushing initial segment without checkout', async () => {
    replay.getOptions()._experiments.traceInternals = true;

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    await new Promise(process.nextTick);
    jest.setSystemTime(BASE_TIMESTAMP);

    // Clear the event buffer to simulate no checkout happened
    replay.eventBuffer!.clear();

    // click happens first
    domHandler({
      name: 'click',
      event: new Event('click'),
    });

    // no checkout!
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(1);

    const replayData = mockSendReplay.mock.calls[0][0];

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
        timestamp: BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY,
        data: {
          tag: 'breadcrumb',
          payload: {
            timestamp: (BASE_TIMESTAMP + DEFAULT_FLUSH_MIN_DELAY) / 1000,
            type: 'default',
            category: 'console',
            data: { logger: 'replay' },
            level: 'info',
            message: '[Replay] Flushing initial segment without checkout.',
          },
        },
      },
    ]);

    replay.getOptions()._experiments.traceInternals = false;
  });

  it('logs warning if adding event that is after maxReplayDuration', async () => {
    replay.getOptions()._experiments.traceInternals = true;

    const spyLogger = jest.spyOn(SentryUtils.logger, 'info');

    sessionStorage.clear();
    clearSession(replay);
    replay['_initializeSessionForSampling']();
    replay.setInitialState();
    await new Promise(process.nextTick);
    jest.setSystemTime(BASE_TIMESTAMP);

    replay.eventBuffer!.clear();

    // We do not care about this warning here
    replay.eventBuffer!.hasCheckout = true;

    // Add event that is too long after session start
    const TEST_EVENT = getTestEventCheckout({ timestamp: BASE_TIMESTAMP + MAX_REPLAY_DURATION + 100 });
    mockRecord._emitter(TEST_EVENT);

    // no checkout!
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    // No flush is scheduled is aborted because event is after maxReplayDuration
    expect(mockFlush).toHaveBeenCalledTimes(0);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);

    expect(spyLogger).toHaveBeenLastCalledWith(
      `[Replay] Skipping event with timestamp ${
        BASE_TIMESTAMP + MAX_REPLAY_DURATION + 100
      } because it is after maxReplayDuration`,
    );

    replay.getOptions()._experiments.traceInternals = false;
    spyLogger.mockRestore();
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
    jest.setSystemTime(BASE_TIMESTAMP);

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

    await advanceTimers(160_000);

    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockSendReplay).toHaveBeenCalledTimes(0);
    expect(replay.isEnabled()).toBe(false);

    replay.getOptions().maxReplayDuration = MAX_REPLAY_DURATION;

    // Start again for following tests
    await replay.start();
  });
});
