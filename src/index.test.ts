jest.mock('rrweb', () => {
  const mockRecordFn: jest.Mock & Partial<RecordAdditionalProperties> = jest.fn(
    ({ emit }) => {
      mockRecordFn._emitter = emit;
    }
  );
  mockRecordFn.takeFullSnapshot = jest.fn((isCheckout) => {
    if (!mockRecordFn._emitter) {
      return;
    }

    mockRecordFn._emitter(
      {
        data: { isCheckout },
        timestamp: BASE_TIMESTAMP,
        type: 2,
      },
      isCheckout
    );
  });

  return {
    record: mockRecordFn as RecordMock,
  };
});

import * as Sentry from '@sentry/browser';
import * as rrweb from 'rrweb';

import { SentryReplay } from '@';
import {
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from '@/session/constants';
import { BASE_TIMESTAMP } from '@test';
import { ReplaySpan, RRWebEvent } from '@/types';
import { Breadcrumbs } from '@sentry/browser/types/integrations';

type RecordAdditionalProperties = {
  takeFullSnapshot: jest.Mock;

  // Below are not mocked
  addCustomEvent: () => void;
  freezePage: () => void;
  mirror: unknown;

  // Custom property to fire events in tests, does not exist in rrweb.record
  _emitter: (event: RRWebEvent, ...args: any[]) => void;
};
type RecordMock = jest.MockedFunction<typeof rrweb.record> &
  RecordAdditionalProperties;

jest.unmock('@sentry/browser');

const mockRecord = rrweb.record as RecordMock;

jest.useFakeTimers();

// TODO: tests for our breadcrumbs / spans
describe('SentryReplay', () => {
  let replay: SentryReplay;
  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    // XXX: We can only call `Sentry.init` once, not sure how to destroy it
    // after it has been in initialized
    replay = new SentryReplay({
      stickySession: true,
      rrwebConfig: { ignoreClass: 'sr-test' },
    });
    Sentry.init({
      dsn: 'https://dsn@ingest.f00.f00/1',
      tracesSampleRate: 1.0,
      integrations: [replay],
    });
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
  });

  afterEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    sessionStorage.clear();
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
  });

  afterAll(() => {
    replay && replay.teardown();
  });

  it('calls rrweb.record with custom options', () => {
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
    expect(replay.session.id).toBeDefined();
    expect(replay.session.sequenceId).toBeDefined();
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

  it('does not create a new session if user hides the tab and comes back within 60 seconds', () => {
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

  it('uploads a replay event when document becomes hidden', () => {
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
    replay.events = [TEST_EVENT];

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledWith({
      endpoint: expect.stringMatching(regex),
      events: [TEST_EVENT],
      replaySpans: [],
      breadcrumbs: [],
    });

    // Session's last activity should be updated
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledWith({
      endpoint: expect.stringMatching(regex),
      events: [TEST_EVENT],
      replaySpans: [],
      breadcrumbs: [],
    });

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });

  it('uploads a replay event if 15 seconds have elapsed since the last replay upload', () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Fire a new event every 4 seconds, 4 times
    [...Array(4)].forEach(() => {
      mockRecord._emitter(TEST_EVENT);
      jest.advanceTimersByTime(4000);
    });

    // We are at time = +16seconds now (relative to BASE_TIMESTAMP)
    // The next event should cause an upload immediately
    mockRecord._emitter(TEST_EVENT);
    expect(replay).toHaveSentReplay([...Array(5)].map(() => TEST_EVENT));

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockSendReplayRequest.mockClear();
    jest.advanceTimersByTime(5000);
    expect(replay).not.toHaveSentReplay();

    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + 16000);
    expect(replay.session.sequenceId).toBe(1);
    // events array should be empty
    expect(replay.events).toHaveLength(0);

    // Let's make sure it continues to work
    mockSendReplayRequest.mockClear();
    mockRecord._emitter(TEST_EVENT);
    jest.advanceTimersByTime(5000);
    expect(replay).toHaveSentReplay([TEST_EVENT]);

    // Clean-up
    mockSendReplayRequest.mockReset();
  });

  it('creates a new session if user has been idle for more than 15 minutes and comes back to move their mouse', () => {
    const initialSession = replay.session;

    expect(initialSession.id).toBeDefined();

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

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);

    expect(replay).toHaveSentReplay([
      { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
    ]);

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    mockSendReplayRequest.mockReset();
  });

  it('fails to upload data on first call and retries after five seconds, sending successfully', async () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    // fail the first request and pass the second one
    mockSendReplayRequest.mockImplementationOnce(() => {
      throw new Error('Something bad happened');
    });
    mockSendReplayRequest.mockImplementationOnce(() => {
      return Promise.resolve();
    });
    mockRecord._emitter(TEST_EVENT);
    jest.advanceTimersToNextTimer();
    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );

    expect(replay.sendReplayRequest).toHaveBeenCalledTimes(2);

    const replayRequestPayload = {
      endpoint: expect.stringMatching(regex),
      events: [TEST_EVENT],
      replaySpans: <ReplaySpan[]>[],
      breadcrumbs: <Breadcrumbs[]>[],
    };

    const replayRequestPayloadTwo = {
      ...replayRequestPayload,
      // since we log an error on retry, a console breadcrumb gets added to the subsequent sentReplayRequest call
      breadcrumbs: [
        {
          category: 'console',
          data: {
            arguments: [Error('Something bad happened')],
            logger: 'console',
          },
          level: 'error',
          message: 'Error: Something bad happened',
          timestamp: expect.any(Number),
          type: 'default',
        },
      ],
    };

    expect(replay.sendReplayRequest).toHaveBeenNthCalledWith(
      1,
      replayRequestPayload
    );
    expect(replay.sendReplayRequest).toHaveBeenNthCalledWith(
      2,
      replayRequestPayloadTwo
    );

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });
});

describe('SentryReplay (no sticky)', () => {
  let replay: SentryReplay;
  type MockSendReplayRequest = jest.MockedFunction<
    typeof replay.sendReplayRequest
  >;
  let mockSendReplayRequest: MockSendReplayRequest;

  beforeAll(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    // XXX: We can only call `Sentry.init` once, not sure how to destroy it
    // after it has been in initialized
    replay = new SentryReplay({
      stickySession: false,
      rrwebConfig: { ignoreClass: 'sr-test' },
    });

    // XXX: we cannot call `Sentry.init()` again in the same test file
    // So we have to fake the init with existing SDK client with a different plugin instance
    replay.setup();

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
  });

  afterEach(() => {
    jest.setSystemTime(new Date(BASE_TIMESTAMP));
    replay.clearSession();
    replay.loadSession({ expiry: SESSION_IDLE_DURATION });
    mockRecord.takeFullSnapshot.mockClear();
  });

  afterAll(() => {
    replay && replay.teardown();
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

  it('does not create a new session if user hides the tab and comes back within 60 seconds', () => {
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

  it('uploads a replay event when document becomes hidden', () => {
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
    replay.events = [TEST_EVENT];

    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledWith({
      endpoint: expect.stringMatching(regex),
      events: [TEST_EVENT],
      replaySpans: [],
      breadcrumbs: [],
    });

    // Session's last activity should be updated
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + ELAPSED);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });

  it('uploads a replay event if 5 seconds have elapsed since the last replay event occurred', () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 2 };
    mockRecord._emitter(TEST_EVENT);
    // Pretend 5 seconds have passed
    const ELAPSED = 5000;
    jest.advanceTimersByTime(ELAPSED);

    expect(mockRecord.takeFullSnapshot).not.toHaveBeenCalled();

    const regex = new RegExp(
      'https://ingest.f00.f00/api/1/events/[^/]+/attachments/\\?sentry_key=dsn&sentry_version=7&sentry_client=replay'
    );
    expect(replay.sendReplayRequest).toHaveBeenCalledWith({
      endpoint: expect.stringMatching(regex),
      events: [TEST_EVENT],
      replaySpans: [],
      breadcrumbs: [],
    });

    // No activity has occurred, session's last activity should remain the same
    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP);
    expect(replay.session.sequenceId).toBe(1);

    // events array should be empty
    expect(replay.events).toHaveLength(0);
  });

  it('uploads a replay event if 15 seconds have elapsed since the last replay upload', () => {
    const TEST_EVENT = { data: {}, timestamp: BASE_TIMESTAMP, type: 3 };
    // Fire a new event every 4 seconds, 4 times
    [...Array(4)].forEach(() => {
      mockRecord._emitter(TEST_EVENT);
      jest.advanceTimersByTime(4000);
    });

    // We are at time = +16seconds now (relative to BASE_TIMESTAMP)
    // The next event should cause an upload immediately
    mockRecord._emitter(TEST_EVENT);
    expect(replay).toHaveSentReplay([...Array(5)].map(() => TEST_EVENT));

    // There should also not be another attempt at an upload 5 seconds after the last replay event
    mockSendReplayRequest.mockClear();
    jest.advanceTimersByTime(5000);
    expect(replay).not.toHaveSentReplay();

    expect(replay.session.lastActivity).toBe(BASE_TIMESTAMP + 16000);
    expect(replay.session.sequenceId).toBe(1);
    // events array should be empty
    expect(replay.events).toHaveLength(0);

    // Let's make sure it continues to work
    mockSendReplayRequest.mockClear();
    mockRecord._emitter(TEST_EVENT);
    jest.advanceTimersByTime(5000);
    expect(replay).toHaveSentReplay([TEST_EVENT]);

    // Clean-up
    mockSendReplayRequest.mockReset();
  });

  it('creates a new session if user has been idle for more than 15 minutes and comes back to move their mouse', () => {
    const initialSession = replay.session;

    expect(initialSession.id).toBeDefined();

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

    // Instead of recording the above event, a full snapshot will occur.
    //
    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.
    expect(mockRecord.takeFullSnapshot).toHaveBeenCalledWith(true);

    expect(replay).toHaveSentReplay([
      { data: { isCheckout: true }, timestamp: BASE_TIMESTAMP, type: 2 },
    ]);

    // Should be a new session
    expect(replay).not.toHaveSameSession(initialSession);

    mockSendReplayRequest.mockReset();
  });
});
