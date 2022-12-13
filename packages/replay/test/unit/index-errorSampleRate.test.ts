import { captureException } from '@sentry/core';

import { REPLAY_SESSION_KEY, VISIBILITY_CHANGE_TIMEOUT, WINDOW } from '../../src/constants';
import { addEvent } from '../../src/util/addEvent';
import { ReplayContainer } from './../../src/replay';
import { PerformanceEntryResource } from './../fixtures/performanceEntry/resource';
import { BASE_TIMESTAMP, RecordMock } from './../index';
import { resetSdkMock } from './../mocks/resetSdkMock';
import { DomHandler } from './../types';
import { useFakeTimers } from './../utils/use-fake-timers';

useFakeTimers();

async function advanceTimers(time: number) {
  jest.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

describe('Replay (errorSampleRate)', () => {
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
    replay.clearSession();
    replay.stop();
  });

  it('uploads a replay when `Sentry.captureException` is called and continues recording', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    // Does not capture mouse click
    domHandler({
      name: 'click',
    });
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();

    captureException(new Error('testing'));
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        tags: expect.objectContaining({
          errorSampleRate: 1,
          replayType: 'error',
          sessionSampleRate: 0,
        }),
      }),
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

    // This is from when we stop recording and start a session recording
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
      replayEventPayload: expect.objectContaining({
        tags: expect.objectContaining({
          errorSampleRate: 1,
          replayType: 'error',
          sessionSampleRate: 0,
        }),
      }),
      events: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + 5020, type: 2 }]),
    });

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // New checkout when we call `startRecording` again after uploading segment
    // after an error occurs
    expect(replay).toHaveLastSentReplay({
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
    expect(replay).toHaveLastSentReplay({
      events: JSON.stringify([
        {
          type: 5,
          timestamp: BASE_TIMESTAMP + 10000 + 40,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: (BASE_TIMESTAMP + 10000 + 40) / 1000,
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
    await advanceTimers(5000);
    expect(replay).not.toHaveLastSentReplay();

    // Let's make sure it continues to work
    mockRecord._emitter(TEST_EVENT);
    await advanceTimers(5000);
    jest.runAllTimers();
    await new Promise(process.nextTick);
    expect(replay).not.toHaveLastSentReplay();
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
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.

    expect(replay).not.toHaveLastSentReplay();
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);
  });

  it('has the correct timestamps with deferred root event and last replay update', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveLastSentReplay();

    jest.runAllTimers();
    await new Promise(process.nextTick);

    jest.advanceTimersByTime(5000);

    captureException(new Error('testing'));

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 }, TEST_EVENT]),
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // the exception happens roughly 10 seconds after BASE_TIMESTAMP
        // (advance timers + waiting for flush after the checkout) and
        // extra time is likely due to async of `addMemoryEntry()`

        timestamp: (BASE_TIMESTAMP + 5000 + 5000 + 20) / 1000,
        error_ids: [expect.any(String)],
        trace_ids: [],
        urls: ['http://localhost/'],
        replay_id: expect.any(String),
      }),
      recordingPayloadHeader: { segment_id: 0 },
    });
  });

  it('has correct timestamps when error occurs much later than initial pageload/checkout', async () => {
    const ELAPSED = 60000;
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

    jest.runAllTimers();
    jest.advanceTimersByTime(20);
    await new Promise(process.nextTick);

    captureException(new Error('testing'));

    jest.runAllTimers();
    jest.advanceTimersByTime(20);
    await new Promise(process.nextTick);

    expect(replay.session?.started).toBe(BASE_TIMESTAMP + ELAPSED + 20);

    // Does not capture mouse click
    expect(replay).toHaveSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      replayEventPayload: expect.objectContaining({
        // Make sure the old performance event is thrown out
        replay_start_timestamp: (BASE_TIMESTAMP + ELAPSED + 20) / 1000,
      }),
      events: JSON.stringify([
        {
          data: { isCheckout: true },
          timestamp: BASE_TIMESTAMP + ELAPSED + 20,
          type: 2,
        },
      ]),
    });
  });
});

/**
 * This is testing a case that should only happen with error-only sessions.
 * Previously we had assumed that loading a session from session storage meant
 * that the session was not new. However, this is not the case with error-only
 * sampling since we can load a saved session that did not have an error (and
 * thus no replay was created).
 */
it('sends a replay after loading the session multiple times', async () => {
  // Pretend that a session is already saved before loading replay
  WINDOW.sessionStorage.setItem(
    REPLAY_SESSION_KEY,
    `{"segmentId":0,"id":"fd09adfc4117477abc8de643e5a5798a","sampled":"error","started":${BASE_TIMESTAMP},"lastActivity":${BASE_TIMESTAMP}}`,
  );
  const { mockRecord, replay } = await resetSdkMock({
    replayOptions: {
      stickySession: true,
    },
    autoStart: false,
  });
  replay.start();

  jest.runAllTimers();

  await new Promise(process.nextTick);
  const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
  mockRecord._emitter(TEST_EVENT);

  expect(replay).not.toHaveLastSentReplay();

  captureException(new Error('testing'));
  jest.runAllTimers();
  await new Promise(process.nextTick);

  expect(replay).toHaveSentReplay({
    events: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 }, TEST_EVENT]),
  });

  // Latest checkout when we call `startRecording` again after uploading segment
  // after an error occurs (e.g. when we switch to session replay recording)
  expect(replay).toHaveLastSentReplay({
    events: JSON.stringify([{ data: { isCheckout: true }, timestamp: BASE_TIMESTAMP + 5020, type: 2 }]),
  });
});
