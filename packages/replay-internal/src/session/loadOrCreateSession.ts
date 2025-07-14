import { DEBUG_BUILD } from '../debug-build';
import type { Session, SessionOptions } from '../types';
import { debug } from '../util/logger';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { shouldRefreshSession } from './shouldRefreshSession';

/**
 * Get or create a session, when initializing the replay.
 * Returns a session that may be unsampled.
 */
export function loadOrCreateSession(
  {
    sessionIdleExpire,
    maxReplayDuration,
    previousSessionId,
  }: {
    sessionIdleExpire: number;
    maxReplayDuration: number;
    previousSessionId?: string;
  },
  sessionOptions: SessionOptions,
): Session {
  const existingSession = sessionOptions.stickySession && fetchSession();

  // No session exists yet, just create a new one
  if (!existingSession) {
    DEBUG_BUILD && debug.infoTick('Creating new session');
    return createSession(sessionOptions, { previousSessionId });
  }

  if (!shouldRefreshSession(existingSession, { sessionIdleExpire, maxReplayDuration })) {
    return existingSession;
  }

  DEBUG_BUILD && debug.infoTick('Session in sessionStorage is expired, creating new one...');
  return createSession(sessionOptions, { previousSessionId: existingSession.id });
}
