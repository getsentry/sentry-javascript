import {
  MAX_SESSION_LIFE,
  SESSION_IDLE_EXPIRE_DURATION,
  SESSION_IDLE_PAUSE_DURATION,
  WINDOW,
} from '../../../src/constants';
import * as CreateSession from '../../../src/session/createSession';
import * as FetchSession from '../../../src/session/fetchSession';
import { loadOrCreateSession, maybeRefreshSession } from '../../../src/session/getSession';
import { saveSession } from '../../../src/session/saveSession';
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

describe('Unit | session | getSession', () => {
  beforeAll(() => {
    jest.spyOn(CreateSession, 'createSession');
    jest.spyOn(FetchSession, 'fetchSession');
    WINDOW.sessionStorage.clear();
  });

  afterEach(() => {
    WINDOW.sessionStorage.clear();
    (CreateSession.createSession as jest.MockedFunction<typeof CreateSession.createSession>).mockClear();
    (FetchSession.fetchSession as jest.MockedFunction<typeof FetchSession.fetchSession>).mockClear();
  });

  describe('loadOrCreateSession', () => {
    describe('stickySession: false', () => {
      it('creates new session if none is passed in', function () {
        const session = loadOrCreateSession(
          undefined,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: false,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
        expect(CreateSession.createSession).toHaveBeenCalled();

        expect(session).toEqual({
          id: 'test_session_uuid',
          segmentId: 0,
          lastActivity: expect.any(Number),
          sampled: 'session',
          started: expect.any(Number),
          shouldRefresh: true,
        });

        // Should not have anything in storage
        expect(FetchSession.fetchSession()).toBe(null);
      });

      it('creates new session, even if something is in sessionStorage', function () {
        const sessionInStorage = createMockSession(Date.now() - 10000, 'test_old_session_uuid');
        saveSession(sessionInStorage);

        const session = loadOrCreateSession(
          undefined,
          {
            timeouts: { ...timeouts, sessionIdleExpire: 1000 },
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: false,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
        expect(CreateSession.createSession).toHaveBeenCalled();

        expect(session).toEqual({
          id: 'test_session_uuid',
          segmentId: 0,
          lastActivity: expect.any(Number),
          sampled: 'session',
          started: expect.any(Number),
          shouldRefresh: true,
        });

        // Should not have anything in storage
        expect(FetchSession.fetchSession()).toEqual(sessionInStorage);
      });

      it('uses passed in session', function () {
        const now = Date.now();
        const currentSession = createMockSession(now - 2000);

        const session = loadOrCreateSession(
          currentSession,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: false,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
        expect(CreateSession.createSession).not.toHaveBeenCalled();

        expect(session).toEqual(currentSession);
      });
    });

    describe('stickySession: true', () => {
      it('creates new session if none exists', function () {
        const session = loadOrCreateSession(
          undefined,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: true,
          },
        );

        expect(FetchSession.fetchSession).toHaveBeenCalled();
        expect(CreateSession.createSession).toHaveBeenCalled();

        const expectedSession = {
          id: 'test_session_uuid',
          segmentId: 0,
          lastActivity: expect.any(Number),
          sampled: 'session',
          started: expect.any(Number),
          shouldRefresh: true,
        };
        expect(session).toEqual(expectedSession);

        // Should also be stored in storage
        expect(FetchSession.fetchSession()).toEqual(expectedSession);
      });

      it('creates new session if session in sessionStorage is expired', function () {
        const now = Date.now();
        const date = now - 2000;
        saveSession(createMockSession(date, 'test_old_session_uuid'));

        const session = loadOrCreateSession(
          undefined,
          {
            timeouts: { ...timeouts, sessionIdleExpire: 1000 },
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: true,
          },
        );

        expect(FetchSession.fetchSession).toHaveBeenCalled();
        expect(CreateSession.createSession).toHaveBeenCalled();

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
        expect(FetchSession.fetchSession()).toEqual(expectedSession);
      });

      it('returns session from sessionStorage if not expired', function () {
        const date = Date.now() - 2000;
        saveSession(createMockSession(date, 'test_old_session_uuid'));

        const session = loadOrCreateSession(
          undefined,
          {
            timeouts: { ...timeouts, sessionIdleExpire: 5000 },
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: true,
          },
        );

        expect(FetchSession.fetchSession).toHaveBeenCalled();
        expect(CreateSession.createSession).not.toHaveBeenCalled();

        expect(session).toEqual({
          id: 'test_old_session_uuid',
          segmentId: 0,
          lastActivity: date,
          sampled: 'session',
          started: date,
          shouldRefresh: true,
        });
      });

      it('uses passed in session instead of fetching from sessionStorage', function () {
        const now = Date.now();
        saveSession(createMockSession(now - 10000, 'test_storage_session_uuid'));
        const currentSession = createMockSession(now - 2000);

        const session = loadOrCreateSession(
          currentSession,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            stickySession: true,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
        expect(CreateSession.createSession).not.toHaveBeenCalled();

        expect(session).toEqual(currentSession);
      });
    });

    describe('buffering', () => {
      it('returns current session when buffering, even if expired', function () {
        const now = Date.now();
        const currentSession = makeSession({
          id: 'test_session_uuid_2',
          lastActivity: now - 2000,
          started: now - 2000,
          segmentId: 0,
          sampled: 'buffer',
          shouldRefresh: true,
        });

        const session = loadOrCreateSession(
          currentSession,
          {
            timeouts: { ...timeouts, sessionIdleExpire: 1000 },
          },
          {
            ...SAMPLE_OPTIONS,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
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

        const session = loadOrCreateSession(
          currentSession,
          {
            timeouts: { ...timeouts, sessionIdleExpire: 1000 },
          },
          {
            ...SAMPLE_OPTIONS,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
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

        const session = loadOrCreateSession(
          currentSession,
          {
            timeouts: { ...timeouts, sessionIdleExpire: 5000 },
          },
          {
            ...SAMPLE_OPTIONS,
          },
        );

        expect(FetchSession.fetchSession).not.toHaveBeenCalled();
        expect(CreateSession.createSession).not.toHaveBeenCalled();

        expect(session).toEqual(currentSession);
      });
    });

    describe('sampling', () => {
      it('returns unsampled session if sample rates are 0', function () {
        const session = loadOrCreateSession(
          undefined,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            sessionSampleRate: 0,
            allowBuffering: false,
          },
        );

        const expectedSession = {
          id: 'test_session_uuid',
          segmentId: 0,
          lastActivity: expect.any(Number),
          sampled: false,
          started: expect.any(Number),
          shouldRefresh: true,
        };
        expect(session).toEqual(expectedSession);
      });

      it('returns `session` session if sessionSampleRate===1', function () {
        const session = loadOrCreateSession(
          undefined,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            sessionSampleRate: 1.0,
            allowBuffering: false,
          },
        );

        expect(session.sampled).toBe('session');
      });

      it('returns `buffer` session if allowBuffering===true', function () {
        const session = loadOrCreateSession(
          undefined,
          {
            timeouts,
          },
          {
            ...SAMPLE_OPTIONS,
            sessionSampleRate: 0.0,
            allowBuffering: true,
          },
        );

        expect(session.sampled).toBe('buffer');
      });
    });
  });

  describe('maybeRefreshSession', () => {
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
});
