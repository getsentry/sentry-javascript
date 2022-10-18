jest.unmock('@sentry/browser');

// mock functions need to be imported first
import { captureException } from '@sentry/browser';
import { BASE_TIMESTAMP, mockRrweb, mockSdk } from '@test';

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
  const { record: mockRecord } = mockRrweb();

  beforeAll(async () => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    ({ replay } = await mockSdk({
      replayOptions: { captureOnlyOnError: true, stickySession: false },
    }));
    jest.runAllTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    // mockSendReplayRequest.mockClear();
    mockRecord.takeFullSnapshot.mockClear();
  });

  afterEach(async () => {
    jest.runAllTimers();
    await new Promise(process.nextTick);
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.clearSession();
    replay.eventBuffer?.destroy();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
  });

  afterAll(() => {
    replay && replay.stop();
  });

  it('uploads a replay when captureException is called', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();

    // TODO: captureException(new Error('testing')) does not trigger addGlobalEventProcessor
    captureException('testing');
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({ events: JSON.stringify([TEST_EVENT]) });
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
    await new Promise(process.nextTick);
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
    await new Promise(process.nextTick);
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
    await new Promise(process.nextTick);
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
    await new Promise(process.nextTick);
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

    await new Promise(process.nextTick);
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
    await new Promise(process.nextTick);
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

    await new Promise(process.nextTick);
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
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    mockRecord._emitter(TEST_EVENT);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).not.toHaveSentReplay();

    jest.advanceTimersByTime(5000);

    // TODO: captureException(new Error('testing')) does not trigger addGlobalEventProcessor
    captureException('testing');

    // ugh...
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    expect(replay).toHaveSentReplay({
      events: JSON.stringify([TEST_EVENT]),
      replayEventPayload: expect.objectContaining({
        replay_start_timestamp: BASE_TIMESTAMP / 1000,
        // the exception happens roughly 5 seconds after BASE_TIMESTAMP and
        // extra time is likely due to async of `addMemoryEntry()`
        timestamp: expect.closeTo((BASE_TIMESTAMP + 5000) / 1000, 1),
        error_ids: [expect.any(String)],
        trace_ids: [],
        urls: ['http://localhost/'],
        replay_id: expect.any(String),
      }),
      recordingPayloadHeader: { segment_id: 0 },
    });
  });
});
