import type { Session, SessionOptions, Timeouts } from '../types';
import { isSessionExpired } from '../util/isSessionExpired';
import { logInfoNextTick } from '../util/log';
import { createSession } from './createSession';
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
  // If not expired, all good, just keep the session
  if (!isSessionExpired(session, timeouts)) {
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
