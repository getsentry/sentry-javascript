import type { Session, SessionOptions } from '../types';
import { logInfoNextTick } from '../util/log';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { shouldRefreshSession } from './shouldRefreshSession';

/**
 * Get or create a session, when initializing the replay.
 * Returns a session that may be unsampled.
 */
export function loadOrCreateSession(
  {
    traceInternals,
    sessionIdleExpire,
    maxReplayDuration,
    previousSessionId,
  }: {
    sessionIdleExpire: number;
    maxReplayDuration: number;
    traceInternals?: boolean;
    previousSessionId?: string;
  },
  sessionOptions: SessionOptions,
): Session {
  const existingSession = sessionOptions.stickySession && fetchSession(traceInternals);

  // No session exists yet, just create a new one
  if (!existingSession) {
    logInfoNextTick('[Replay] Creating new session', traceInternals);
    return createSession(sessionOptions, { previousSessionId });
  }

  if (!shouldRefreshSession(existingSession, { sessionIdleExpire, maxReplayDuration })) {
    return existingSession;
  }

  logInfoNextTick('[Replay] Session in sessionStorage is expired, creating new one...');
  return createSession(sessionOptions, { previousSessionId: existingSession.id });
}
