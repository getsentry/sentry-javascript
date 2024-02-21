import type { Sampled, Session, SessionOptions } from '../types';
import { isSampled } from '../util/isSampled';
import { makeSession } from './Session';
import { saveSession } from './saveSession';

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
export function createSession(
  { sessionSampleRate, allowBuffering, stickySession = false }: SessionOptions,
  { previousSessionId }: { previousSessionId?: string } = {},
): Session {
  const sampled = getSessionSampleType(sessionSampleRate, allowBuffering);
  const session = makeSession({
    sampled,
    previousSessionId,
  });

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
