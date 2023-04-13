import { logger } from '@sentry/utils';

import type { Session, SessionOptions, Timeouts } from '../types';
import { isSessionExpired } from '../util/isSessionExpired';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { makeSession } from './Session';

interface GetSessionParams extends SessionOptions {
  timeouts: Timeouts;

  /**
   * The current session (e.g. if stickySession is off)
   */
  currentSession?: Session;
}

/**
 * Get or create a session
 */
export function getSession({
  timeouts,
  currentSession,
  stickySession,
  sessionSampleRate,
  errorSampleRate,
}: GetSessionParams): { type: 'new' | 'saved'; session: Session } {
  // If session exists and is passed, use it instead of always hitting session storage
  const session = currentSession || (stickySession && fetchSession());

  if (session) {
    // If there is a session, check if it is valid (e.g. "last activity" time
    // should be within the "session idle time", and "session started" time is
    // within "max session time").
    const isExpired = isSessionExpired(session, timeouts);

    if (!isExpired) {
      return { type: 'saved', session };
    } else if (session.sampled === 'buffer') {
      // Buffered samples should not be re-created when expired, but instead we stop when the replay is done
      const discardedSession = makeSession({ sampled: false });
      return { type: 'new', session: discardedSession };
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
