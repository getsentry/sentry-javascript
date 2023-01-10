import { getCurrentHub, Hub } from '@sentry/core';
import { Event, Scope } from '@sentry/types';
import { EventType } from 'rrweb';

import {
  DEFAULT_FLUSH_MIN_DELAY,
  MASK_ALL_TEXT_SELECTOR,
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
  VISIBILITY_CHANGE_TIMEOUT,
  WINDOW,
} from '../../src/constants';
import { ReplayContainer } from '../../src/replay';
import type { RecordingEvent } from '../../src/types';
import { addEvent } from '../../src/util/addEvent';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import { clearSession } from '../utils/clearSession';
import { useFakeTimers } from '../utils/use-fake-timers';
import { PerformanceEntryResource } from './../fixtures/performanceEntry/resource';
import { BASE_TIMESTAMP, RecordMock } from './../index';
import { resetSdkMock } from './../mocks/resetSdkMock';
import { DomHandler } from './../types';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

describe('Replay with custom mock', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls rrweb.record with custom options', async () => {
    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        ignoreClass: 'sentry-test-ignore',
        stickySession: false,
      },
    });
    expect(mockRecord.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "blockClass": "sentry-block",
        "blockSelector": "[data-sentry-block],img,image,svg,path,rect,area,video,object,picture,embed,map,audio",
        "emit": [Function],
        "ignoreClass": "sentry-test-ignore",
        "maskAllInputs": true,
        "maskTextClass": "sentry-mask",
        "maskTextSelector": "${MASK_ALL_TEXT_SELECTOR}",
      }
    `);
  });

  describe('auto save session', () => {
    test.each([
      ['with stickySession=true', true, 1],
      ['with stickySession=false', false, 0],
    ])('%s', async (_: string, stickySession: boolean, addSummand: number) => {
      let saveSessionSpy;

      jest.mock('../../src/session/saveSession', () => {
        saveSessionSpy = jest.fn();

        return {
          saveSession: saveSessionSpy,
        };
      });

      const { replay } = await resetSdkMock({
        replayOptions: {
          stickySession,
        },
      });

      // Initially called up to three times: once for start, then once for replay.updateSessionActivity & once for segmentId increase
      expect(saveSessionSpy).toHaveBeenCalledTimes(addSummand * 3);

      replay.updateSessionActivity();

      expect(saveSessionSpy).toHaveBeenCalledTimes(addSummand * 4);

      // In order for runFlush to actually do something, we need to add an event
      const event = {
        type: EventType.Custom,
        data: {
          tag: 'test custom',
        },
        timestamp: new Date().valueOf(),
      } as RecordingEvent;

      addEvent(replay, event);

      await replay.runFlush();

      expect(saveSessionSpy).toHaveBeenCalledTimes(addSummand * 5);
    });
  });
});

describe('Replay', () => {
  let replay: ReplayContainer;
  let mockRecord: RecordMock;
  let mockTransportSend: jest.SpyInstance<any>;
  let domHandler: DomHandler;
  const prevLocation = WINDOW.location;

  type MockSendReplayRequest = jest.MockedFunction<typeof replay.sendReplayRequest>;
  let mockSendReplayRequest: MockSendReplayRequest;

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest.runAllTimers();
  });

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    }));

    mockTransportSend = jest.spyOn(getCurrentHub().getClient()!.getTransport()!, 'send');

    jest.spyOn(replay, 'flush');
    jest.spyOn(replay, 'runFlush');
    jest.spyOn(replay, 'sendReplayRequest');

    // Create a new session and clear mocks because a segment (from initial
    // checkout) will have already been uploaded by the time the tests run
    clearSession(replay);
    replay.loadSession({ expiry: 0 });
    mockTransportSend.mockClear();
    mockSendReplayRequest = replay.sendReplayRequest as MockSendReplayRequest;
    mockSendReplayRequest.mockClear();
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
    mockSendReplayRequest.mockRestore();
    mockRecord.takeFullSnapshot.mockClear();
    replay.stop();
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

    WINDOW.dispatchEvent(new Event('focus'));

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

  it('uploads a replay event when WINDOW is blurred', async () => {
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

    addEvent(replay, TEST_EVENT);
    WINDOW.dispatchEvent(new Event('blur'));
    await new Promise(process.nextTick);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveLastSentReplay({
      events: JSON.stringify([TEST_EVENT, hiddenBreadcrumb]),
    });
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

    addEvent(replay, TEST_EVENT);
    document.dispatchEvent(new Event('visibilitychange'));
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveLastSentReplay({ events: JSON.stringify([TEST_EVENT]) });

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
    expect(mockTransportSend).toHaveBeenCalledTimes(1);
    expect(replay).toHaveLastSentReplay({ events: JSON.stringify([TEST_EVENT]) });

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

    expect(replay).toHaveLastSentReplay({
      events: JSON.stringify([...Array(5)].map(() => TEST_EVENT)),
    });

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockTransportSend.mockClear();
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(replay).not.toHaveLastSentReplay();

    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);

    // Let's make sure it continues to work
    mockTransportSend.mockClear();
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(replay).toHaveLastSentReplay({ events: JSON.stringify([TEST_EVENT]) });
  });

  it('creates a new session if user has been idle for 15 minutes and comes back to click their mouse', async () => {
    const initialSession = replay.session;

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
    expect(replay).not.toHaveLastSentReplay();

    await new Promise(process.nextTick);

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);

    expect(replay).not.toHaveLastSentReplay();

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    // Now do a click
    domHandler({
      name: 'click',
    });

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    const newTimestamp = BASE_TIMESTAMP + FIFTEEN_MINUTES;
    const breadcrumbTimestamp = newTimestamp + 20; // I don't know where this 20ms comes from

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      events: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: breadcrumbTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: breadcrumbTimestamp / 1000,
              type: 'default',
              category: 'ui.click',
              message: '<unknown>',
              data: {},
            },
          },
        },
      ]),
    });

    // `_context` should be reset when a new session is created
    expect(replay.getContext()).toEqual(
      expect.objectContaining({
        initialUrl: 'http://dummy/',
        initialTimestamp: newTimestamp,
      }),
    );
  });

  it('does not record if user has been idle for more than MAX_SESSION_LIFE and only starts a new session after a user action', async () => {
    jest.clearAllMocks();
    const initialSession = replay.session;

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

    // Idle for MAX_SESSION_LIFE
    jest.advanceTimersByTime(MAX_SESSION_LIFE);

    // These events will not get flushed and will eventually be dropped because user is idle and session is expired
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: MAX_SESSION_LIFE,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    // performance events can still be collected while recording is stopped
    // TODO: we may want to prevent `addEvent` from adding to buffer when user is inactive
    replay.addUpdate(() => {
      createPerformanceSpans(replay, [
        {
          type: 'navigation.navigate',
          name: 'foo',
          start: BASE_TIMESTAMP + MAX_SESSION_LIFE,
          end: BASE_TIMESTAMP + MAX_SESSION_LIFE + 100,
        },
      ]);
      return true;
    });

    WINDOW.dispatchEvent(new Event('blur'));
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();
    // Should be the same session because user has been idle and no events have caused a new session to be created
    expect(replay).toHaveSameSession(initialSession);

    // @ts-ignore private
    expect(replay._stopRecording).toBeUndefined();

    // Now do a click
    domHandler({
      name: 'click',
    });
    // This should still be thrown away
    mockRecord._emitter(TEST_EVENT);

    const NEW_TEST_EVENT = {
      data: { name: 'test' },
      timestamp: BASE_TIMESTAMP + MAX_SESSION_LIFE + DEFAULT_FLUSH_MIN_DELAY + 20,
      type: 3,
    };

    mockRecord._emitter(NEW_TEST_EVENT);

    // new session is created
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveSameSession(initialSession);
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    const newTimestamp = BASE_TIMESTAMP + MAX_SESSION_LIFE + DEFAULT_FLUSH_MIN_DELAY + 20; // I don't know where this 20ms comes from
    const breadcrumbTimestamp = newTimestamp;

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      events: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: breadcrumbTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: breadcrumbTimestamp / 1000,
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
        initialTimestamp: newTimestamp,
      }),
    );
  });

  it('uploads a dom breadcrumb 5 seconds after listener receives an event', async () => {
    domHandler({
      name: 'click',
    });

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(replay).toHaveLastSentReplay({
      events: JSON.stringify([
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

    expect(replay.session?.segmentId).toBe(1);
  });

  it('fails to upload data on first two calls and succeeds on the third', async () => {
    expect(replay.session?.segmentId).toBe(0);
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

    // Suppress console.errors
    const mockConsole = jest.spyOn(console, 'error').mockImplementation(jest.fn());

    // fail the first and second requests and pass the third one
    mockTransportSend.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    mockTransportSend.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    // next tick should retry and succeed
    mockConsole.mockRestore();

    await advanceTimers(8000);
    await advanceTimers(2000);

    expect(replay).toHaveLastSentReplay({
      replayEventPayload: expect.objectContaining({
        error_ids: [],
        replay_id: expect.any(String),
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // 20seconds = Add up all of the previous `advanceTimers()`
        timestamp: (BASE_TIMESTAMP + 20000) / 1000 + 0.02,
        trace_ids: [],
        urls: ['http://localhost/'],
      }),
      recordingPayloadHeader: { segment_id: 0 },
      events: JSON.stringify([TEST_EVENT]),
    });

    mockTransportSend.mockClear();
    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBeGreaterThanOrEqual(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // next tick should do nothing
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(replay).not.toHaveLastSentReplay();
  });

  it('fails to upload data and hits retry max and stops', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    jest.spyOn(replay, 'sendReplay');

    // Suppress console.errors
    const mockConsole = jest.spyOn(console, 'error').mockImplementation(jest.fn());

    // Check errors
    const spyHandleException = jest.spyOn(replay, 'handleException');

    expect(replay.session?.segmentId).toBe(0);

    // fail the first and second requests and pass the third one
    mockSendReplayRequest.mockReset();
    mockSendReplayRequest.mockImplementation(() => {
      throw new Error('Something bad happened');
    });
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(1);

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(2);

    await advanceTimers(10000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(3);

    await advanceTimers(30000);
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(4);
    expect(replay.sendReplay).toHaveBeenCalledTimes(4);

    mockConsole.mockReset();

    // Make sure it doesn't retry again
    jest.runAllTimers();
    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(4);
    expect(replay.sendReplay).toHaveBeenCalledTimes(4);

    // Retries = 3 (total tries = 4 including initial attempt)
    // + last exception is max retries exceeded
    expect(spyHandleException).toHaveBeenCalledTimes(5);
    expect(spyHandleException).toHaveBeenLastCalledWith(new Error('Unable to send Replay - max retries exceeded'));

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);

    // segmentId increases despite error
    expect(replay.session?.segmentId).toBe(1);
  });

  it('increases segment id after each event', async () => {
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

    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP + ELAPSED,
      type: 2,
    };

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

  it('has correct timestamps when there events earlier than initial timestamp', async function () {
    clearSession(replay);
    replay.loadSession({ expiry: 0 });
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

    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP + ELAPSED,
      type: 2,
    };

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
        replay_type: 'session',
        tags: expect.objectContaining({
          errorSampleRate: 0,
          sessionSampleRate: 1,
        }),
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
    replay.performanceEvents.push(
      PerformanceEntryResource({
        startTime: -ELAPSED,
      }),
    );

    // This should be null because `addEvent` has not been called yet
    expect(replay.getContext().earliestEvent).toBe(null);
    expect(mockTransportSend).toHaveBeenCalledTimes(0);

    // A new checkout occurs (i.e. a new session was started)
    const TEST_EVENT = {
      data: {},
      timestamp: BASE_TIMESTAMP,
      type: 2,
    };

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
      events: JSON.stringify([
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
    expect(replay.getContext().earliestEvent).toBe(null);
  });

  it('has single flush when checkout flush and debounce flush happen near simultaneously', async () => {
    // click happens first
    domHandler({
      name: 'click',
    });

    // checkout
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    mockRecord._emitter(TEST_EVENT);

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(replay.flush).toHaveBeenCalledTimes(1);

    // Make sure there's nothing queued up after
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    expect(replay.flush).toHaveBeenCalledTimes(1);
  });
});

describe('eventProcessors', () => {
  let hub: Hub;
  let scope: Scope;

  beforeEach(() => {
    hub = getCurrentHub();
    scope = hub.pushScope();
  });

  afterEach(() => {
    hub.popScope();
    jest.resetAllMocks();
  });

  it('handles event processors properly', async () => {
    const MUTATED_TIMESTAMP = BASE_TIMESTAMP + 3000;

    const { mockRecord } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    });

    const client = hub.getClient()!;

    jest.runAllTimers();
    const mockTransportSend = jest.spyOn(client.getTransport()!, 'send');
    mockTransportSend.mockReset();

    const handler1 = jest.fn((event: Event): Event | null => {
      event.timestamp = MUTATED_TIMESTAMP;

      return event;
    });

    const handler2 = jest.fn((): Event | null => {
      return null;
    });

    scope.addEventProcessor(handler1);

    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

    mockRecord._emitter(TEST_EVENT);
    jest.runAllTimers();
    jest.advanceTimersByTime(1);
    await new Promise(process.nextTick);

    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    scope.addEventProcessor(handler2);

    const TEST_EVENT2 = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };

    mockRecord._emitter(TEST_EVENT2);
    jest.runAllTimers();
    jest.advanceTimersByTime(1);
    await new Promise(process.nextTick);

    expect(mockTransportSend).toHaveBeenCalledTimes(1);

    expect(handler1).toHaveBeenCalledTimes(2);
    expect(handler2).toHaveBeenCalledTimes(1);

    // This receives an envelope, which is a deeply nested array
    // We only care about the fact that the timestamp was mutated
    expect(mockTransportSend).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ timestamp: MUTATED_TIMESTAMP })])]),
      ]),
    );
  });
});
