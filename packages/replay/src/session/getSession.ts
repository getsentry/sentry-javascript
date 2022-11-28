import { logger } from '@sentry/utils';

import { SessionOptions } from '../types';
import { isSessionExpired } from '../util/isSessionExpired';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { Session } from './Session';

interface GetSessionParams extends SessionOptions {
  /**
   * The length of time (in ms) which we will consider the session to be expired.
   */
  expiry: number;

  /**
   * The current session (e.g. if stickySession is off)
   */
  currentSession?: Session;
}

/**
 * Get or create a session
 */
export function getSession({
  expiry,
  currentSession,
  stickySession,
  sessionSampleRate,
  errorSampleRate,
}: GetSessionParams): { type: 'new' | 'saved'; session: Session } {
  // If session exists and is passed, use it instead of always hitting session storage
  const session = currentSession || (stickySession && fetchSession({ sessionSampleRate, errorSampleRate }));

  if (session) {
    // If there is a session, check if it is valid (e.g. "last activity" time
    // should be within the "session idle time", and "session started" time is
    // within "max session time").
    const isExpired = isSessionExpired(session, expiry);

    if (!isExpired) {
      return { type: 'saved', session };
    } else {
      __DEBUG_BUILD__ && logger.log('[Replay] Session has expired');
    }
    // Otherwise continue to create a new session
  }

  const newSession = createSession({
    stickySession,
    sessionSampleRate,
    errorSampleRate,
  });

  return { type: 'new', session: newSession };
}
