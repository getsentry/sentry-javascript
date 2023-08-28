import type { Session, SessionOptions, Timeouts } from '../types';
import { logInfoNextTick } from '../util/log';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { maybeRefreshSession } from './maybeRefreshSession';

/**
 * Get or create a session, when initializing the replay.
 * Returns a session that may be unsampled.
 */
export function loadOrCreateSession(
  currentSession: Session | undefined,
  {
    timeouts,
    traceInternals,
  }: {
    timeouts: Timeouts;
    traceInternals?: boolean;
  },
  sessionOptions: SessionOptions,
): Session {
  // If session exists and is passed, use it instead of always hitting session storage
  const existingSession = currentSession || (sessionOptions.stickySession && fetchSession(traceInternals));

  // No session exists yet, just create a new one
  if (!existingSession) {
    logInfoNextTick('[Replay] Created new session', traceInternals);
    return createSession(sessionOptions);
  }

  return maybeRefreshSession(existingSession, { timeouts, traceInternals }, sessionOptions);
}
