// mock functions need to be imported first
import * as SentryCore from '@sentry/core';
import * as SentryUtils from '@sentry/utils';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';

import { SentryReplay } from '@';
import * as CaptureReplayEvent from '@/api/captureReplayEvent';
import {
  REPLAY_SESSION_KEY,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from '@/session/constants';

jest.useFakeTimers({ advanceTimers: true });

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

describe('SentryReplay', () => {
  let replay: SentryReplay;
  const prevLocation = window.location;

  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;
  let domHandler: (args: any) => any;
  const { record: mockRecord } = mockRrweb();
  jest.spyOn(CaptureReplayEvent, 'captureReplayEvent');
  const mockCaptureReplayEvent =
    CaptureReplayEvent.captureReplayEvent as jest.MockedFunction<
      typeof CaptureReplayEvent.captureReplayEvent
    >;
  jest.spyOn(SentryCore, 'captureEvent');
  const mockCaptureEvent = SentryCore.captureEvent as jest.MockedFunction<
    typeof SentryCore.captureEvent
  >;

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest
      .spyOn(SentryUtils, 'addInstrumentationHandler')
      .mockImplementation((type, handler: (args: any) => any) => {
        if (type === 'dom') {
          domHandler = handler;
        }
      });

    ({ replay } = mockSdk());
    jest.spyOn(replay, 'sendReplayRequest');
    mockSendReplayRequest = replay.sendReplayRequest as MockSendReplayRequest;
    mockSendReplayRequest.mockImplementation(
      jest.fn(async () => {
        return;
      })
    );
    jest.runAllTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockSendReplayRequest.mockClear();
    replay.eventBuffer?.destroy();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
    // @ts-expect-error: The operand of a 'delete' operator must be optional.ts(2790)
    delete window.location;
    Object.defineProperty(window, 'location', {
      value: prevLocation,
      writable: true,
    });
    mockCaptureReplayEvent.mockClear();
    mockCaptureEvent.mockClear();
  });

  afterAll(() => {
    replay && replay.destroy();
  });

  it('calls rrweb.record with custom options', async () => {
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blockClass": "sr-block",
        "emit": [Function],
        "ignoreClass": "sr-test",
        "maskAllInputs": true,
        "maskTextClass": "sr-mask",
      }
    `);
  });

  it('should have a session after setup', () => {
    expect(replay.session).toMatchObject({
      lastActivity: BASE_TIMESTAMP,
      started: BASE_TIMESTAMP,
    });
    expect(replay.session?.id).toBeDefined();
    expect(replay.session?.segmentId).toBeDefined();
    expect(mockCaptureReplayEvent).not.toHaveBeenCalled();
  });

  it('clears session', () => {
    replay.clearSession();
    expect(window.sessionStorage.getItem(REPLAY_SESSION_KEY)).toBe(null);
    expect(replay.session).toBe(undefined);
  });

  it('creates a new session and triggers a full dom snapshot when document becomes visible after [VISIBILITY_CHANGE_TIMEOUT]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = replay.session;

    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).toHaveBeenLastCalledWith(true);

    // Should have created a new session
    expect(replay).not.toHaveSameSession(initialSession);
  });

  it('creates a new session and triggers a full dom snapshot when document becomes focused after [VISIBILITY_CHANGE_TIMEOUT]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = replay.session;

    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

    window.dispatchEvent(new Event('focus'));

    expect(mockRecord.takeFullSnapshot).toHaveBeenLastCalledWith(true);

    // Should have created a new session
    expect(replay).not.toHaveSameSession(initialSession);
  });

  it('does not create a new session if user hides the tab and comes back within [VISIBILITY_CHANGE_TIMEOUT] seconds', () => {
    const initialSession = replay.session;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);

    // User comes back before `VISIBILITY_CHANGE_TIMEOUT` elapses
    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT - 1);
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

  it('uploads a replay event when window is blurred', async () => {
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
    const hiddenBreadcrumb = {
      type: 5,
      timestamp: +new Date(BASE_TIMESTAMP + ELAPSED) / 1000,
      data: {
        tag: 'breadcrumb',
        payload: {
          timestamp: +new Date(BASE_TIMESTAMP + ELAPSED) / 1000,
          type: 'default',
          category: 'ui.blur',
        },
      },
    };

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay).toHaveSentReplay(
      JSON.stringify([TEST_EVENT, hiddenBreadcrumb])
    );
    // Session's last activity should not be updated
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
  });

  it('uploads a replay event when document becomes hidden', async () => {
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

    replay.addEvent(TEST_EVENT);
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Session's last activity is not updated because we do not consider
    // visibilitystate as user being active
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // No user activity to trigger an update
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
  });

  it('uploads a replay event if 15 seconds have elapsed since the last replay upload', async () => {
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

    expect(replay).toHaveSentReplay(
      JSON.stringify([...Array(5)].map(() => TEST_EVENT))
    );

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockSendReplayRequest.mockClear();
    await advanceTimers(5000);

    expect(replay).not.toHaveSentReplay();

    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);

    // Let's make sure it continues to work
    mockSendReplayRequest.mockClear();
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(5000);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Clean-up
    mockSendReplayRequest.mockReset();
  });

  it('creates a new session if user has been idle for more than 15 minutes and comes back to move their mouse', async () => {
    const initialSession = replay.session;

    expect(initialSession?.id).toBeDefined();
    // @ts-expect-error private member
    expect(replay.initialState).toEqual({
      url: 'http://localhost/',
      timestamp: BASE_TIMESTAMP,
    });

    const url = 'http://dummy/';
    Object.defineProperty(window, 'location', {
      value: new URL(url),
    });

    // Idle for 15 minutes
    const FIFTEEN_MINUTES = 15 * 60000;
    jest.advanceTimersByTime(FIFTEEN_MINUTES);

    // TBD: We are currently deciding that this event will get dropped, but
    // this could/should change in the future.
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveSentReplay();

    await new Promise(process.nextTick);

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);

    expect(replay).not.toHaveSentReplay();

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    // Now do a click
    domHandler({
      name: 'click',
    });

    await advanceTimers(5000);

    const newTimestamp = BASE_TIMESTAMP + FIFTEEN_MINUTES;
    const breadcrumbTimestamp = newTimestamp + 20; // I don't know where this 20ms comes from

    expect(replay).toHaveSentReplay(
      JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: breadcrumbTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: breadcrumbTimestamp / 1000,
              type: 'default',
              category: `ui.click`,
              message: '<unknown>',
              data: {},
            },
          },
        },
      ])
    );

    // `initialState` should be reset when a new session is created
    // @ts-expect-error private member
    expect(replay.initialState).toEqual({
      url: 'http://dummy/',
      timestamp: newTimestamp,
    });
  });

  it('uploads a dom breadcrumb 5 seconds after listener receives an event', async () => {
    domHandler({
      name: 'click',
    });

    // Pretend 5 seconds have passed
    await advanceTimers(5000);

    expect(replay).toHaveSentReplay(
      JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: BASE_TIMESTAMP / 1000,
              type: 'default',
              category: `ui.click`,
              message: '<unknown>',
              data: {},
            },
          },
        },
      ])
    );

    expect(replay.session?.segmentId).toBe(1);
  });

  it('fails to upload data on first two calls and succeeds on the third', async () => {
    mockCaptureEvent.mockReset();
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Suppress console.errors
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    const mockConsole = console.error as jest.MockedFunction<
      typeof console.error
    >;
    // fail the first and second requests and pass the third one
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(5000);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled(); // Does not get captured until recording is uploaded
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Reset console.error mock to minimize the amount of time we are hiding
    // console messages in case an error happens after
    mockConsole.mockClear();

    mockCaptureEvent.mockReset();
    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(5000);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);

    // next tick should retry and succeed
    mockConsole.mockClear();
    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementationOnce(() => {
      return Promise.resolve();
    });

    await advanceTimers(8000);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
    await advanceTimers(2000);
    expect(mockCaptureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        error_ids: expect.arrayContaining([expect.any(String)]),
        replay_id: expect.any(String),
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        segment_id: 0,
        timestamp: (BASE_TIMESTAMP + 5000) / 1000,
        trace_ids: [],
        type: 'replay_event',
        urls: ['http://localhost/'],
      }),
      {
        event_id: expect.any(String),
      }
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBeGreaterThanOrEqual(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // next tick should do nothing

    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementationOnce(() => {
      return Promise.resolve();
    });
    await advanceTimers(5000);
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
  });

  it('sends a replay event after each recording event', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(mockCaptureReplayEvent).toHaveBeenCalled();
    expect(replay.session?.segmentId).toBe(1);

    (
      replay.sendReplayRequest as jest.MockedFunction<
        typeof replay.sendReplayRequest
      >
    ).mockClear();
    mockCaptureReplayEvent.mockClear();

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(replay.sendReplayRequest).toHaveBeenCalled();
    expect(mockCaptureReplayEvent).toHaveBeenCalled();
    expect(replay.session?.segmentId).toBe(2);
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
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
    expect(mockCaptureReplayEvent).not.toHaveBeenCalled();

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP + ELAPSED,
      type: 2,
    };

    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockCaptureReplayEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: {
          timestamp: BASE_TIMESTAMP,
          url: 'http://localhost/', // this doesn't truly test if we are capturing the right URL as we don't change URLs, but good enough
        },
      })
    );
  });

  it('does not create replay event if recording upload completely fails', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Suppress console.errors
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    const mockConsole = console.error as jest.MockedFunction<
      typeof console.error
    >;
    // fail the first and second requests and pass the third one
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(5000);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(mockCaptureEvent).not.toHaveBeenCalled(); // Does not get captured until recording is uploaded
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);
    expect(replay).toHaveSentReplay(JSON.stringify([TEST_EVENT]));

    // Reset console.error mock to minimize the amount of time we are hiding
    // console messages in case an error happens after
    mockConsole.mockClear();

    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(5000);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(2);

    // next tick should retry and fail
    mockConsole.mockClear();

    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(10000);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(3);

    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(30000);
    expect(mockCaptureEvent).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(4);

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBeGreaterThanOrEqual(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // TODO: Recording should stop and next event should do nothing
  });

  it('has correct timestamps when there events earlier than initial timestamp', async function () {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(process.nextTick);
    expect(replay.sendReplayRequest).not.toHaveBeenCalled();
    expect(mockCaptureReplayEvent).not.toHaveBeenCalled();

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP + ELAPSED,
      type: 2,
    };

    replay.addEvent(TEST_EVENT);

    // Add a fake event that started BEFORE
    replay.addEvent({
      data: {},
      timestamp: (BASE_TIMESTAMP - 10000) / 1000,
      type: 5,
    });

    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockCaptureReplayEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        initialState: {
          timestamp: BASE_TIMESTAMP - 10000,
          url: 'http://localhost/', // this doesn't truly test if we are capturing the right URL as we don't change URLs, but good enough
        },
      })
    );
  });

  it('does not have stale `replay_start_timestamp`', async function () {
    // @ts-expect-error read-only
    window.performance.timeOrigin = BASE_TIMESTAMP;
    // add a fake/old performance event
    replay.performanceEvents.push({
      name: 'https://dev.getsentry.net:7999/_assets/sentry.js',
      entryType: 'resource',
      startTime: 0,
      duration: 101.90000003576279,
      initiatorType: 'script',
      nextHopProtocol: 'http/1.1',
      workerStart: 0,
      redirectStart: 0,
      redirectEnd: 0,
      fetchStart: 325.19999998807907,
      domainLookupStart: 325.19999998807907,
      domainLookupEnd: 325.19999998807907,
      connectStart: 325.19999998807907,
      connectEnd: 325.19999998807907,
      secureConnectionStart: 325.19999998807907,
      requestStart: 394.19999998807907,
      responseStart: 399.69999998807907,
      responseEnd: 427.10000002384186,
      transferSize: 287606,
      encodedBodySize: 287306,
      decodedBodySize: 1190668,
      serverTiming: [],
    } as unknown as PerformanceEntry);

    const oldSessionId = replay.session?.id;

    // This should be null because `addEvent` has not been called
    // @ts-expect-error private member
    expect(replay.context.earliestEvent).toBe(null);

    // Force new session
    const ELAPSED = 86400000 * 2; // 2 days
    await advanceTimers(ELAPSED);
    // XXX: this blur is needed to trigger `flushUpdate` + new session
    window.dispatchEvent(new Event('blur'));

    const TEST_EVENT = {
      data: {},
      timestamp: (BASE_TIMESTAMP + ELAPSED) / 1000,
      type: 2,
    };

    // This event will trigger capturing recording
    replay.addEvent(TEST_EVENT);
    window.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);

    expect(replay.session?.id).not.toBe(oldSessionId);
    expect(mockCaptureEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        replay_start_timestamp: (BASE_TIMESTAMP + ELAPSED) / 1000,
      }),
      { event_id: expect.any(String) }
    );

    // This gets reset after sending replay
    // @ts-expect-error private member
    expect(replay.context.earliestEvent).toBe(null);
  });
});
