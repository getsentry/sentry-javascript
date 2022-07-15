import { logger } from '@/util/logger';
import { captureReplay } from '@/api/captureReplay';

import { saveSession } from './saveSession';
import { Session } from './Session';

interface CreateSessionParams {
  /**
   * Should save to sessionStorage?
   */
  stickySession: boolean;
}

/**
 * Create a new session, which in its current implementation is a Sentry event
 * that all replays will be saved to as attachments. Currently, we only expect
 * one of these Sentry events per "replay session".
 */
export function createSession({
  stickySession = false,
}: CreateSessionParams): Session {
  const session = new Session(undefined, { stickySession });

  logger.log(`Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
