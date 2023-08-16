import {
  MAX_SESSION_LIFE,
  SESSION_IDLE_EXPIRE_DURATION,
  SESSION_IDLE_PAUSE_DURATION,
  WINDOW,
} from '../../../src/constants';
import * as CreateSession from '../../../src/session/createSession';
import { maybeRefreshSession } from '../../../src/session/maybeRefreshSession';
import { makeSession } from '../../../src/session/Session';
import type { SessionOptions, Timeouts } from '../../../src/types';

jest.mock('@sentry/utils', () => {
  return {
    ...(jest.requireActual('@sentry/utils') as { string: unknown }),
    uuid4: jest.fn(() => 'test_session_uuid'),
  };
});

const SAMPLE_OPTIONS: SessionOptions = {
  stickySession: false,
  sessionSampleRate: 1.0,
  allowBuffering: false,
};

const timeouts: Timeouts = {
  sessionIdlePause: SESSION_IDLE_PAUSE_DURATION,
  sessionIdleExpire: SESSION_IDLE_EXPIRE_DURATION,
  maxSessionLife: MAX_SESSION_LIFE,
};

function createMockSession(when: number = Date.now(), id = 'test_session_id') {
  return makeSession({
    id,
    segmentId: 0,
    lastActivity: when,
    started: when,
    sampled: 'session',
    shouldRefresh: true,
  });
}

describe('Unit | session | maybeRefreshSession', () => {
  beforeAll(() => {
    jest.spyOn(CreateSession, 'createSession');
  });

  afterEach(() => {
    WINDOW.sessionStorage.clear();
    (CreateSession.createSession as jest.MockedFunction<typeof CreateSession.createSession>).mockClear();
  });

  it('returns session if not expired', function () {
    const now = Date.now();
    const currentSession = createMockSession(now - 2000);

    const session = maybeRefreshSession(
      currentSession,
      {
        timeouts,
      },
      {
        ...SAMPLE_OPTIONS,
      },
    );

    expect(CreateSession.createSession).not.toHaveBeenCalled();

    expect(session).toEqual(currentSession);
  });

  it('creates new session if expired', function () {
    const now = Date.now();
    const currentSession = createMockSession(now - 2000, 'test_old_session_uuid');

    const session = maybeRefreshSession(
      currentSession,
      {
        timeouts: { ...timeouts, sessionIdleExpire: 1000 },
      },
      {
        ...SAMPLE_OPTIONS,
      },
    );

    expect(CreateSession.createSession).toHaveBeenCalled();

    expect(session).not.toEqual(currentSession);
    const expectedSession = {
      id: 'test_session_uuid',
      segmentId: 0,
      lastActivity: expect.any(Number),
      sampled: 'session',
      started: expect.any(Number),
      shouldRefresh: true,
      previousSessionId: 'test_old_session_uuid',
    };
    expect(session).toEqual(expectedSession);
    expect(session.lastActivity).toBeGreaterThanOrEqual(now);
    expect(session.started).toBeGreaterThanOrEqual(now);
  });

  describe('buffering', () => {
    it('returns session when buffering, even if expired', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 0,
        sampled: 'buffer',
        shouldRefresh: true,
      });

      const session = maybeRefreshSession(
        currentSession,
        {
          timeouts: { ...timeouts, sessionIdleExpire: 1000 },
        },
        {
          ...SAMPLE_OPTIONS,
        },
      );

      expect(CreateSession.createSession).not.toHaveBeenCalled();

      expect(session).toEqual(currentSession);
    });

    it('returns new unsampled session when buffering & expired, if shouldRefresh===false', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 0,
        sampled: 'buffer',
        shouldRefresh: false,
      });

      const session = maybeRefreshSession(
        currentSession,
        {
          timeouts: { ...timeouts, sessionIdleExpire: 1000 },
        },
        {
          ...SAMPLE_OPTIONS,
        },
      );

      expect(CreateSession.createSession).not.toHaveBeenCalled();

      expect(session).not.toEqual(currentSession);
      expect(session.sampled).toBe(false);
      expect(session.started).toBeGreaterThanOrEqual(now);
    });

    it('returns existing session when buffering & not expired, if shouldRefresh===false', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 0,
        sampled: 'buffer',
        shouldRefresh: false,
      });

      const session = maybeRefreshSession(
        currentSession,
        {
          timeouts: { ...timeouts, sessionIdleExpire: 5000 },
        },
        {
          ...SAMPLE_OPTIONS,
        },
      );

      expect(CreateSession.createSession).not.toHaveBeenCalled();

      expect(session).toEqual(currentSession);
    });
  });

  describe('sampling', () => {
    it('creates unsampled session if sample rates are 0', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 0,
        sampled: 'session',
        shouldRefresh: true,
      });

      const session = maybeRefreshSession(
        currentSession,
        {
          timeouts: { ...timeouts, sessionIdleExpire: 1000 },
        },
        {
          ...SAMPLE_OPTIONS,
          sessionSampleRate: 0,
          allowBuffering: false,
        },
      );

      expect(session.id).toBe('test_session_uuid');
      expect(session.sampled).toBe(false);
    });

    it('creates `session` session if sessionSampleRate===1', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 0,
        sampled: 'session',
        shouldRefresh: true,
      });

      const session = maybeRefreshSession(
        currentSession,
        {
          timeouts: { ...timeouts, sessionIdleExpire: 1000 },
        },
        {
          ...SAMPLE_OPTIONS,
          sessionSampleRate: 1.0,
          allowBuffering: false,
        },
      );

      expect(session.id).toBe('test_session_uuid');
      expect(session.sampled).toBe('session');
    });

    it('creates `buffer` session if allowBuffering===true', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 0,
        sampled: 'session',
        shouldRefresh: true,
      });

      const session = maybeRefreshSession(
        currentSession,
        {
          timeouts: { ...timeouts, sessionIdleExpire: 1000 },
        },
        {
          ...SAMPLE_OPTIONS,
          sessionSampleRate: 0.0,
          allowBuffering: true,
        },
      );

      expect(session.id).toBe('test_session_uuid');
      expect(session.sampled).toBe('buffer');
    });
  });
});
