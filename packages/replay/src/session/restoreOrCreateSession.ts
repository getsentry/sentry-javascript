import { logger } from '@sentry/utils';

import type { Sampled, Session } from '../types';
import { createSession } from './createSession';
import { fetchSession } from './fetchSession';

/** Either restore a session from sessionStorage, or create a new one. */
export function restoreOrCreateSession({
  stickySession,
  sampled,
  forceSampled,
}: {
  stickySession: boolean;
  sampled: Sampled;
  forceSampled: boolean;
}): Session {
  const currentSession = stickySession && fetchSession();

  if (currentSession && currentSession.sampled !== sampled && forceSampled) {
    // If for whatever reason the session from sessionStorage has a different sampling, we force to the new sampling
    __DEBUG_BUILD__ &&
      logger.log(`[Replay] Tried to restore session with different sampling: ${currentSession.sampled} !== ${sampled}`);
  } else if (currentSession) {
    __DEBUG_BUILD__ && logger.log(`[Replay] Loaded session from sessionStorage: id=${currentSession.id}`);
    return currentSession;
  }

  const newSession = createSession({
    stickySession,
    sampled,
  });

  return newSession;
}
