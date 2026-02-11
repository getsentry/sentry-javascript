/**
 * @vitest-environment jsdom
 */

import type { MockedFunction } from 'vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MAX_REPLAY_DURATION, SESSION_IDLE_EXPIRE_DURATION, WINDOW } from '../../../src/constants';
import * as CreateSession from '../../../src/session/createSession';
import * as FetchSession from '../../../src/session/fetchSession';
import { loadOrCreateSession } from '../../../src/session/loadOrCreateSession';
import { saveSession } from '../../../src/session/saveSession';
import { makeSession } from '../../../src/session/Session';
import type { SessionOptions } from '../../../src/types';

vi.mock('@sentry/core', async () => {
  return {
    ...(await vi.importActual('@sentry/core')),
    uuid4: vi.fn(() => 'test_session_uuid'),
  };
});

const OPTIONS_STICKY: SessionOptions = {
  stickySession: true,
  sessionSampleRate: 1.0,
  allowBuffering: false,
};

const OPTIONS_NON_SICKY: SessionOptions = {
  stickySession: false,
  sessionSampleRate: 1.0,
  allowBuffering: false,
};

const DEFAULT_OPTIONS = {
  sessionIdleExpire: SESSION_IDLE_EXPIRE_DURATION,
  maxReplayDuration: MAX_REPLAY_DURATION,
};

function createMockSession(when: number = Date.now(), id = 'test_session_id') {
  return makeSession({
    id,
    segmentId: 0,
    lastActivity: when,
    started: when,
    sampled: 'session',
  });
}

describe('Unit | session | loadOrCreateSession', () => {
  beforeAll(() => {
    vi.spyOn(CreateSession, 'createSession');
    vi.spyOn(FetchSession, 'fetchSession');
    WINDOW.sessionStorage.clear();
  });

  afterEach(() => {
    WINDOW.sessionStorage.clear();
    (CreateSession.createSession as MockedFunction<typeof CreateSession.createSession>).mockClear();
    (FetchSession.fetchSession as MockedFunction<typeof FetchSession.fetchSession>).mockClear();
  });

  describe('stickySession: false', () => {
    it('creates new session', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
        },
        OPTIONS_NON_SICKY,
      );

      expect(FetchSession.fetchSession).not.toHaveBeenCalled();
      expect(CreateSession.createSession).toHaveBeenCalled();

      expect(session).toEqual({
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: 'session',
        started: expect.any(Number),
        dirty: false,
      });

      // Should not have anything in storage
      expect(FetchSession.fetchSession()).toBe(null);
    });

    it('creates new session, even if something is in sessionStorage', function () {
      const sessionInStorage = createMockSession(Date.now() - 10000, 'test_old_session_uuid');
      saveSession(sessionInStorage);

      const session = loadOrCreateSession(
        {
          sessionIdleExpire: 1000,
          maxReplayDuration: MAX_REPLAY_DURATION,
        },
        OPTIONS_NON_SICKY,
      );

      expect(FetchSession.fetchSession).not.toHaveBeenCalled();
      expect(CreateSession.createSession).toHaveBeenCalled();

      expect(session).toEqual({
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: 'session',
        started: expect.any(Number),
        dirty: false,
      });

      // Should not have anything in storage
      expect(FetchSession.fetchSession()).toEqual(sessionInStorage);
    });

    it('uses passed in previousSessionId', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
          previousSessionId: 'previous_session_id',
        },
        OPTIONS_NON_SICKY,
      );

      expect(FetchSession.fetchSession).not.toHaveBeenCalled();
      expect(CreateSession.createSession).toHaveBeenCalled();

      expect(session).toEqual({
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: 'session',
        started: expect.any(Number),
        previousSessionId: 'previous_session_id',
        dirty: false,
      });
    });
  });
  describe('stickySession: true', () => {
    it('creates new session if none exists', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
        },
        OPTIONS_STICKY,
      );

      expect(FetchSession.fetchSession).toHaveBeenCalled();
      expect(CreateSession.createSession).toHaveBeenCalled();

      const expectedSession = {
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: 'session',
        started: expect.any(Number),
        dirty: false,
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
        {
          sessionIdleExpire: 1000,
          maxReplayDuration: MAX_REPLAY_DURATION,
        },
        OPTIONS_STICKY,
      );

      expect(FetchSession.fetchSession).toHaveBeenCalled();
      expect(CreateSession.createSession).toHaveBeenCalled();

      const expectedSession = {
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: 'session',
        started: expect.any(Number),
        previousSessionId: 'test_old_session_uuid',
        dirty: false,
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
        {
          sessionIdleExpire: 5000,
          maxReplayDuration: MAX_REPLAY_DURATION,
        },
        OPTIONS_STICKY,
      );

      expect(FetchSession.fetchSession).toHaveBeenCalled();
      expect(CreateSession.createSession).not.toHaveBeenCalled();

      expect(session).toEqual({
        id: 'test_old_session_uuid',
        segmentId: 0,
        lastActivity: date,
        sampled: 'session',
        started: date,
        dirty: false,
      });
    });

    it('ignores previousSessionId when loading from sessionStorage', function () {
      const now = Date.now();
      const currentSession = createMockSession(now - 10000, 'test_storage_session_uuid');
      saveSession(currentSession);

      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
          previousSessionId: 'previous_session_id',
        },
        OPTIONS_STICKY,
      );

      expect(FetchSession.fetchSession).toHaveBeenCalled();
      expect(CreateSession.createSession).not.toHaveBeenCalled();

      expect(session).toEqual(currentSession);
    });

    it('uses previousSessionId when creating new session', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
          previousSessionId: 'previous_session_id',
        },
        OPTIONS_STICKY,
      );

      expect(FetchSession.fetchSession).toHaveBeenCalled();
      expect(CreateSession.createSession).toHaveBeenCalled();

      const expectedSession = {
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: 'session',
        started: expect.any(Number),
        previousSessionId: 'previous_session_id',
        dirty: false,
      };
      expect(session).toEqual(expectedSession);

      // Should also be stored in storage
      expect(FetchSession.fetchSession()).toEqual(expectedSession);
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
      });
      saveSession(currentSession);

      const session = loadOrCreateSession(
        {
          sessionIdleExpire: 1000,
          maxReplayDuration: MAX_REPLAY_DURATION,
        },
        OPTIONS_STICKY,
      );

      expect(session).toEqual(currentSession);
    });

    it('returns new session when buffering & expired, if segmentId>0', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 1,
        sampled: 'buffer',
      });
      saveSession(currentSession);

      const session = loadOrCreateSession(
        {
          sessionIdleExpire: 1000,
          maxReplayDuration: MAX_REPLAY_DURATION,
        },
        OPTIONS_STICKY,
      );

      expect(session).not.toEqual(currentSession);
      expect(session.sampled).toBe('session');
      expect(session.started).toBeGreaterThanOrEqual(now);
      expect(session.segmentId).toBe(0);
    });

    it('returns existing session when buffering & not expired, if segmentId>0', function () {
      const now = Date.now();
      const currentSession = makeSession({
        id: 'test_session_uuid_2',
        lastActivity: now - 2000,
        started: now - 2000,
        segmentId: 1,
        sampled: 'buffer',
      });
      saveSession(currentSession);

      const session = loadOrCreateSession(
        {
          sessionIdleExpire: 5000,
          maxReplayDuration: MAX_REPLAY_DURATION,
        },
        OPTIONS_STICKY,
      );

      expect(session).toEqual(currentSession);
    });
  });

  describe('sampling', () => {
    it('returns unsampled session if sample rates are 0', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
        },
        {
          stickySession: false,
          sessionSampleRate: 0,
          allowBuffering: false,
        },
      );

      const expectedSession = {
        id: 'test_session_uuid',
        segmentId: 0,
        lastActivity: expect.any(Number),
        sampled: false,
        dirty: false,
        started: expect.any(Number),
      };
      expect(session).toEqual(expectedSession);
    });

    it('returns `session` session if sessionSampleRate===1', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
        },
        {
          stickySession: false,
          sessionSampleRate: 1.0,
          allowBuffering: false,
        },
      );

      expect(session.sampled).toBe('session');
    });

    it('returns `buffer` session if allowBuffering===true', function () {
      const session = loadOrCreateSession(
        {
          ...DEFAULT_OPTIONS,
        },
        {
          stickySession: false,
          sessionSampleRate: 0.0,
          allowBuffering: true,
        },
      );

      expect(session.sampled).toBe('buffer');
    });
  });
});
