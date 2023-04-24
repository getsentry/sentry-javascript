import { uuid4 } from '@sentry/utils';

import type { Sampled, Session } from '../types';
import { isSampled } from '../util/isSampled';

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

  return {
    id,
    started,
    lastActivity,
    segmentId,
    sampled,
    shouldRefresh: true,
  };
}

/**
 * Get the sampled status for a session based on sample rates & current sampled status.
 */
export function getSessionSampleType(sessionSampleRate: number, errorSampleRate: number): Sampled {
  return isSampled(sessionSampleRate) ? 'session' : errorSampleRate > 0 ? 'buffer' : false;
}
