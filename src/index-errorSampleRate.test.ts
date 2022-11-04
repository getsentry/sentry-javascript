jest.unmock('@sentry/browser');

// mock functions need to be imported first
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { captureException } from '@sentry/browser';
import type { RecordMock } from '@test';
import { BASE_TIMESTAMP } from '@test';

import {
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { Replay } from './';

jest.useFakeTimers({ advanceTimers: true });

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

describe('Replay (capture only on error)', () => {
  let replay: Replay;
  let mockRecord: RecordMock;
  let domHandler: (args: any) => any;

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    jest.runAllTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    // NOTE: The listeners added to `addInstrumentationHandler` are leaking
    // @ts-expect-error Don't know if there's a cleaner way to clean up old event processors
    globalThis.__SENTRY__.globalEventProcessors = [];
    const SentryUtils = await import('@sentry/utils');
    jest
      .spyOn(SentryUtils, 'addInstrumentationHandler')
      .mockImplementation((type, handler: (args: any) => any) => {
        if (type === 'dom') {
          domHandler = handler;
        }
      });
    const { mockRrweb } = await import('../test/mocks/mockRrweb');
    ({ record: mockRecord } = mockRrweb());
    const { mockSdk } = await import('../test/mocks/mockSdk');
    ({ replay } = await mockSdk({
      replayOptions: {
        errorSampleRate: 1.0,
        sessionSampleRate: 0.0,
        stickySession: false,
      },
    }));
    mockRecord.takeFullSnapshot.mockClear();
    jest.runAllTimers();
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.stop();
    replay.clearSession();
    replay.eventBuffer?.destroy();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
  });

  afterAll(() => {
    replay && replay.stop();
  });

  it('uploads a replay when `Sentry.captureException` is called and continues recording', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();

    // Does not capture mouse click
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveSentReplay();

    captureException(new Error('testing'));
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
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

    (global.fetch as jest.MockedFunction<typeof global.fetch>).mockClear();
    expect(replay).not.toHaveSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.runAllTimers();
    await new Promise(process.nextTick);

    // New checkout when we call `startRecording` again after uploading segment
    // after an error occurs
    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + 5000 + 20,
          type: 2,
        },
      ]),
    });

    // Check that click will get captured
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP + 15000 + 60,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: (BASE_TIMESTAMP + 15000 + 60) / 1000,
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

  it('does not send a replay when triggering a full dom snapshot when document becomes visible after [VISIBILITY_CHANGE_TIMEOUT]ms', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).not.toHaveSentReplay();
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

    expect(replay).not.toHaveSentReplay();

    // User comes back before `VISIBILITY_CHANGE_TIMEOUT` elapses
    jest.advanceTimersByTime(VISIBILITY_CHANGE_TIMEOUT - 100);
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
    expect(replay).not.toHaveSentReplay();
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
    replay.addEvent(TEST_EVENT);

    document.dispatchEvent(new Event('visibilitychange'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();
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

    expect(replay).not.toHaveSentReplay();
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

    expect(replay).not.toHaveSentReplay();

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    await advanceTimers(5000);
    expect(replay).not.toHaveSentReplay();

    // Let's make sure it continues to work
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(5000);
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveSentReplay();
  });

  it('does not upload if user has been idle for more than 15 minutes and comes back to move their mouse', async () => {
    // Idle for 15 minutes
    jest.advanceTimersByTime(15 * 60000);

    // TBD: We are currently deciding that this event will get dropped, but
    // this could/should change in the future.
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);
    expect(replay).not.toHaveSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.

    expect(replay).not.toHaveSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);
  });

  it('has the correct timestamps with deferred root event and last replay update', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    jest.advanceTimersByTime(5000);

    captureException(new Error('testing'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([
        { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
        TEST_EVENT,
      ]),
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // the exception happens roughly 10 seconds after BASE_TIMESTAMP
        // (advance timers + waiting for flush after the checkout) and
        // extra time is likely due to async of `addMemoryEntry()`
        timestamp: expect.closeTo((BASE_TIMESTAMP + 5000 + 5000) / 1000, 1),
        error_ids: [expect.any(String)],
        trace_ids: [],
        urls: ['http://localhost/'],
        replay_id: expect.any(String),
      }),
      recordingPayloadHeader: { segment_id: 0 },
    });
  });
});
