import { logger } from '@sentry/utils';

import type { Session, SessionOptions } from '../types';
import { saveSession } from './saveSession';
import { getSessionSampleType, makeSession } from './Session';

/**
 * Create a new session, which in its current implementation is a Sentry event
 * that all replays will be saved to as attachments. Currently, we only expect
 * one of these Sentry events per "replay session".
 */
export function createSession({ sessionSampleRate, errorSampleRate, stickySession = false }: SessionOptions): Session {
  const sampled = getSessionSampleType(sessionSampleRate, errorSampleRate);
  const session = makeSession({
    sampled,
  });

  __DEBUG_BUILD__ && logger.log(`[Replay] Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
