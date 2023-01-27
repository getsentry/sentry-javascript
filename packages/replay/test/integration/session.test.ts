import { getCurrentHub } from '@sentry/core';
import type { Transport } from '@sentry/types';

import {
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
  VISIBILITY_CHANGE_TIMEOUT,
  WINDOW,
} from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { addEvent } from '../../src/util/addEvent';
import { createPerformanceSpans } from '../../src/util/createPerformanceSpans';
import { BASE_TIMESTAMP } from '../index';
import type { RecordMock } from '../mocks/mockRrweb';
import { resetSdkMock } from '../mocks/resetSdkMock';
import { clearSession } from '../utils/clearSession';
import { useFakeTimers } from '../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

const prevLocation = WINDOW.location;

describe('Integration | session', () => {
  let replay: ReplayContainer;
  let domHandler: (args: any) => any;
  let mockRecord: RecordMock;

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
    }));

    const mockTransport = getCurrentHub()?.getClient()?.getTransport()?.send as jest.MockedFunction<Transport['send']>;
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

  it('creates a new session if user has been idle for more than 15 minutes and comes back to move their mouse', async () => {
    const initialSession = replay.session;

    expect(initialSession?.id).toBeDefined();

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

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    // Replay does not send immediately because checkout was due to expired session
    expect(replay).not.toHaveLastSentReplay();

    // Now do a click
    domHandler({
      name: 'click',
    });

    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    const newTimestamp = BASE_TIMESTAMP + FIFTEEN_MINUTES;
    const breadcrumbTimestamp = newTimestamp + 20; // I don't know where this 20ms comes from

    expect(replay).toHaveLastSentReplay({
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: newTimestamp / 1000,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: newTimestamp / 1000,
              type: 'default',
              category: 'replay.recording.start',
              data: { url: 'http://localhost/' },
            },
          },
        },
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
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: newTimestamp / 1000,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: newTimestamp / 1000,
              type: 'default',
              category: 'replay.recording.start',
              data: { url: 'http://dummy/' },
            },
          },
        },
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
      recordingData: JSON.stringify([
        { data: { isCheckout: true }, timestamp: newTimestamp, type: 2 },
        {
          type: 5,
          timestamp: newTimestamp / 1000,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: newTimestamp / 1000,
              type: 'default',
              category: 'replay.recording.start',
              data: { url: 'http://dummy/' },
            },
          },
        },
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

  it('increases segment id after each event', async () => {
    clearSession(replay);
    replay['_loadAndCheckSession'](0);

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
});
