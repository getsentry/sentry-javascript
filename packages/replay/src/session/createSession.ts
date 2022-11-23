import { SessionOptions } from '../types';
import { logger } from '../util/logger';
import { saveSession } from './saveSession';
import { Session } from './Session';

/**
 * Create a new session, which in its current implementation is a Sentry event
 * that all replays will be saved to as attachments. Currently, we only expect
 * one of these Sentry events per "replay session".
 */
export function createSession({ sessionSampleRate, errorSampleRate, stickySession = false }: SessionOptions): Session {
  const session = new Session(undefined, {
    stickySession,
    errorSampleRate,
    sessionSampleRate,
  });

  logger.log(`Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
