import { isSessionExpired } from '@/util/isSessionExpired';
import { logger } from '@/util/logger';

import { createSession } from './createSession';
import { fetchSession } from './fetchSession';
import { Session } from './Session';

interface GetSessionParams {
  /**
   * The length of time (in ms) which we will consider the session to be expired.
   */
  expiry: number;
  /**
   * Should save session to sessionStorage?
   */
  stickySession: boolean;

  /**
   * The current session (e.g. if stickySession is off)
   */
  currentSession?: Session;

  /**
   * The sampling rate of the Session. See integration configuration comments
   * for `replaysSamplingRate`.
   */
  samplingRate?: number;
}

/**
 * Get or create a session
 */
export function getSession({
  expiry,
  currentSession,
  stickySession,
  samplingRate,
}: GetSessionParams) {
  // If session exists and is passed, use it instead of always hitting session storage
  const session = currentSession || (stickySession && fetchSession());

  if (session) {
    // If there is a session, check if it is valid (e.g. "last activity" time should be within the "session idle time")
    // TODO: We should probably set a max age on this as well
    const isExpired = isSessionExpired(session, expiry);

    if (!isExpired) {
      return { type: 'saved', session };
    } else {
      logger.log(`Session has expired`);
    }
    // Otherwise continue to create a new session
  }

  const newSession = createSession({ stickySession, samplingRate });

  return { type: 'new', session: newSession };
}
