import { getCurrentHub } from '@sentry/core';
import type { Transport } from '@sentry/types';

import {
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_SESSION_LIFE,
  REPLAY_SESSION_KEY,
  SESSION_IDLE_PAUSE_DURATION,
  WINDOW,
} from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import type { Session } from '../../src/types';
import { addEvent } from '../../src/util/addEvent';
import { createOptionsEvent } from '../../src/util/handleRecordingEmit';
import { BASE_TIMESTAMP } from '../index';
import type { RecordMock } from '../mocks/mockRrweb';
import { resetSdkMock } from '../mocks/resetSdkMock';
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

  // Require a "user interaction" to start a new session, visibility is not enough. This can be noisy
  // (e.g. rapidly switching tabs/window focus) and leads to empty sessions.
  it('does not create a new session when document becomes visible after [MAX_SESSION_LIFE]ms', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'visible';
      },
    });

    const initialSession = { ...replay.session } as Session;

    jest.advanceTimersByTime(MAX_SESSION_LIFE + 1);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);
  });

  it('pauses and resumes a session if user has been idle for more than SESSION_IDLE_PAUSE_DURATION and comes back to click their mouse', async () => {
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
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: BASE_TIMESTAMP,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);

    await new Promise(process.nextTick);

    expect(replay).not.toHaveLastSentReplay();
    expect(replay.isPaused()).toBe(true);
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();
    expect(replay).toHaveSameSession(initialSession);
    expect(mockRecord).toHaveBeenCalledTimes(1);

    // Now do a click which will create a new session and start recording again
    domHandler({
      name: 'click',
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

  it('creates a new session if current session exceeds MAX_SESSION_LIFE', async () => {
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

    // Advanced past MAX_SESSION_LIFE
    const ELAPSED = MAX_SESSION_LIFE + 1;
    jest.advanceTimersByTime(ELAPSED);
    // Update activity so as to not consider session to be idling
    replay['_updateSessionActivity']();

    // This should trigger a new session
    const TEST_EVENT = {
      data: { name: 'lost event' },
      timestamp: ELAPSED,
      type: 3,
    };
    mockRecord._emitter(TEST_EVENT);

    await new Promise(process.nextTick);
    await waitForFlush();

    const newTimestamp = BASE_TIMESTAMP + ELAPSED;
    const optionsEvent = createOptionsEvent(replay);
    optionsEvent.timestamp = newTimestamp;

    expect(replay).not.toHaveSameSession(initialSession);
    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 0 },
      recordingData: JSON.stringify([{ data: { isCheckout: true }, timestamp: newTimestamp, type: 2 }, optionsEvent]),
    });
    expect(replay.isEnabled()).toBe(true);
    // `_context` should be reset when a new session is created
    expect(replay.getContext()).toEqual(
      expect.objectContaining({
        initialUrl: 'http://dummy/',
        initialTimestamp: newTimestamp,
      }),
    );

    // Now do a click
    domHandler({
      name: 'click',
    });

    const postFlushTimestamp = newTimestamp + DEFAULT_FLUSH_MIN_DELAY + 40;

    const NEW_TEST_EVENT = {
      data: { name: 'test' },
      timestamp: postFlushTimestamp,
      type: 3,
    };
    mockRecord._emitter(NEW_TEST_EVENT);

    await waitForFlush();

    expect(replay).toHaveLastSentReplay({
      recordingPayloadHeader: { segment_id: 1 },
      recordingData: JSON.stringify([
        {
          type: 5,
          timestamp: postFlushTimestamp,
          data: {
            tag: 'breadcrumb',
            payload: {
              timestamp: postFlushTimestamp / 1000,
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
  });

  it('increases segment id after each event', async () => {
    clearSession(replay);
    replay['_initializeSession']('session');

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

async function waitForFlush() {
  await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
}
