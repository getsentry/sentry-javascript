import { logger } from '@/util/logger';
import { saveSession } from './saveSession';
import { ROOT_REPLAY_NAME } from './constants';
import { getCurrentHub } from '@sentry/browser';
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
  const hub = getCurrentHub();

  const session = new Session(undefined, { stickySession });

  hub.captureEvent(
    {
      message: ROOT_REPLAY_NAME,
      tags: { sequenceId: session.sequenceId },
    },
    { event_id: session.id }
  );

  logger.log(`Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
