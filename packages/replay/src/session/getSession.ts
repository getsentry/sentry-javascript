import type { Session, SessionOptions, Timeouts } from '../types';
import { isSessionExpired } from '../util/isSessionExpired';
import { logInfoNextTick } from '../util/log';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { makeSession } from './Session';

/**
 * Check a session, and either return it or a refreshed version of it.
 * The refreshed version may be unsampled.
 * You can check if the session has changed by comparing the session IDs.
 */
export function maybeRefreshSession(
  session: Session,
  {
    timeouts,
    traceInternals,
  }: {
    timeouts: Timeouts;
    traceInternals?: boolean;
  },
  sessionOptions: SessionOptions,
): Session {
  const isExpired = isSessionExpired(session, timeouts);

  // If not expired, all good, just keep the session
  if (!isExpired) {
    return session;
  }

  const isBuffering = session.sampled === 'buffer';

  // If we are buffering & the session may be refreshed, just return it
  if (isBuffering && session.shouldRefresh) {
    return session;
  }

  // If we are buffering & the session may not be refreshed (=it was converted to session previously already)
  // We return an unsampled new session
  if (isBuffering) {
    logInfoNextTick('[Replay] Session should not be refreshed', traceInternals);
    return makeSession({ sampled: false });
  }

  // Else, we are not buffering, and the session is expired, so we need to create a new one
  logInfoNextTick('[Replay] Session has expired, creating new one...', traceInternals);

  const newSession = createSession(sessionOptions, { previousSessionId: session.id });

  return newSession;
}

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

  // If a session exists, and it is not expired, just return it
  if (!isSessionExpired(existingSession, timeouts)) {
    return existingSession;
  }

  // If expired & we have a buffering session that should be refreshed, return it
  if (existingSession.sampled === 'buffer' && existingSession.shouldRefresh) {
    return existingSession;
  }

  // If expired & we have a buffering session that should _not_ be refreshed, return a new unsampled session
  if (existingSession.sampled === 'buffer') {
    logInfoNextTick('[Replay] Session should not be refreshed', traceInternals);
    return makeSession({ sampled: false });
  }

  // Else, we have an expired session that should be refreshed & re-sampled
  logInfoNextTick('[Replay] Session has expired, creating new one...', traceInternals);

  const newSession = createSession(sessionOptions, { previousSessionId: existingSession.id });

  return newSession;
}
