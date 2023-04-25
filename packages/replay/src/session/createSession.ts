import { logger } from '@sentry/utils';

import type { Sampled, Session, SessionOptions } from '../types';
import { isSampled } from '../util/isSampled';
import { saveSession } from './saveSession';
import { makeSession } from './Session';

/**
 * Get the sampled status for a session based on sample rates & current sampled status.
 */
export function getSessionSampleType(sessionSampleRate: number, allowBuffering: boolean): Sampled {
  return isSampled(sessionSampleRate) ? 'session' : allowBuffering ? 'buffer' : false;
}

/**
 * Create a new session, which in its current implementation is a Sentry event
 * that all replays will be saved to as attachments. Currently, we only expect
 * one of these Sentry events per "replay session".
 */
export function createSession({ sessionSampleRate, allowBuffering, stickySession = false }: SessionOptions): Session {
  const sampled = getSessionSampleType(sessionSampleRate, allowBuffering);
  const session = makeSession({
    sampled,
  });

  __DEBUG_BUILD__ && logger.log(`[Replay] Creating new session: ${session.id}`);

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
