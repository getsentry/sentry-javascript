import { getCurrentHub } from '@sentry/core';
import { Transport } from '@sentry/types';
import * as SentryUtils from '@sentry/utils';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';

import { Replay } from './../../src';
import { SESSION_IDLE_DURATION, VISIBILITY_CHANGE_TIMEOUT } from './../../src/session/constants';
import { useFakeTimers } from './../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

type MockTransport = jest.MockedFunction<Transport['send']>;

describe('Replay (no sticky)', () => {
  let replay: Replay;
  let mockTransport: MockTransport;
  let domHandler: (args: any) => any;
  const { record: mockRecord } = mockRrweb();

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest.spyOn(SentryUtils, 'addInstrumentationHandler').mockImplementation((type, handler: (args: any) => any) => {
      if (type === 'dom') {
        domHandler = handler;
      }
    });

    ({ replay } = await mockSdk({
      replayOptions: {
        stickySession: false,
        sessionSampleRate: 1.0,
        errorSampleRate: 0,
      },
    }));
    jest.runAllTimers();
    mockTransport = getCurrentHub()?.getClient()?.getTransport()?.send as MockTransport;
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    mockRecord.takeFullSnapshot.mockClear();
    mockTransport.mockClear();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
  });

  afterAll(() => {
    replay && replay.stop();
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

  it('uploads a replay event when document becomes hidden', async () => {
    mockRecord.takeFullSnapshot.mockClear();
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

    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });

    // Session's last activity is not updated because we do not consider
    // visibilitystate as user being active
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);

    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);
  });

  it('update last activity when user clicks mouse', async () => {
    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);

    domHandler({
      name: 'click',
    });

    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);

    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    domHandler({
      name: 'click',
    });

    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    await advanceTimers(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });

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

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([...Array(5)].map(() => TEST_EVENT)),
    });

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockTransport.mockClear();
    await advanceTimers(5000);
    expect(replay).not.toHaveSentReplay();

    expect(replay.session?.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session?.segmentId).toBe(1);
    // events array should be empty
    expect(replay.eventBuffer?.length).toBe(0);

    // Let's make sure it continues to work
    mockTransport.mockClear();
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(5000);
    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });
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
    expect(replay).not.toHaveSentReplay();

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
    expect(replay).not.toHaveSentReplay();

    // Now do a click
    domHandler({
      name: 'click',
    });

    await advanceTimers(5000);

    const newTimestamp = BASE_TIMESTAMP + FIFTEEN_MINUTES;
    const breadcrumbTimestamp = newTimestamp + 20; // I don't know where this 20ms comes from

    expect(replay).toHaveSentReplay({
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
  });
});
