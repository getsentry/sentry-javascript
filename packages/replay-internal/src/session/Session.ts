import { uuid4 } from '@sentry/utils';

import type { Sampled, Session } from '../types';

/**
 * Get a session with defaults & applied sampling.
 */
export function makeSession(session: Partial<Session> & { sampled: Sampled }): Session {
  const now = Date.now();
  const id = session.id || uuid4();
  // Note that this means we cannot set a started/lastActivity of `0`, but this should not be relevant outside of tests.
  const started = session.started || now;
  const lastActivity = session.lastActivity || now;
  const segmentId = session.segmentId || 0;
  const sampled = session.sampled;
  const previousSessionId = session.previousSessionId;

  return {
    id,
    started,
    lastActivity,
    segmentId,
    sampled,
    previousSessionId,
  };
}
