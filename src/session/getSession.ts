import { isSessionExpired } from '@/util/isSessionExpired';
import { logger } from '@/util/logger';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';

interface GetSessionParams {
  /**
   * The length of time (in ms) which we will consider the session to be expired.
   */
  expiry: number;
  /**
   * Should save session to sessionStorage?
   */
  stickySession: boolean;
}

/**
 * Get or create a session
 */
export function getSession({ expiry, stickySession }: GetSessionParams) {
  const session = stickySession && fetchSession();

  if (session) {
    // If there is a session, check if it is valid (e.g. "last activity" time should be within the "session idle time")
    // TODO: We should probably set a max age on this as well
    const isExpired = isSessionExpired(session, expiry);

    if (!isExpired) {
      logger.log(`Using existing session: ${session.id}`);
      return session;
    } else {
      logger.log(`Session has expired`);
    }
    // Otherwise continue to create a new session
  }

  const newSession = createSession({ stickySession });

  return newSession;
}
