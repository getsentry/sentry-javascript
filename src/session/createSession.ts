import * as Sentry from '@sentry/browser';

import { logger } from '@/util/logger';
import { saveSession } from './saveSession';
import type { ReplaySession } from './types';
import { ROOT_REPLAY_NAME } from './constants';

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
}: CreateSessionParams): ReplaySession {
  const currentDate = new Date().getTime();

  // Create root replay event, this is where attachments will be saved
  const transaction = Sentry.getCurrentHub().startTransaction({
    name: ROOT_REPLAY_NAME,
    tags: {
      isReplayRoot: 'yes',
    },
  });

  // We have to finish the transaction to get an event ID to be able to
  // upload an attachment for that event
  // @ts-expect-error This returns an eventId (string), but is not typed as such
  const id: string = transaction.finish();

  logger.log(`Creating new session: ${id}`);

  const session = {
    id,
    spanId: transaction.spanId,
    traceId: transaction.traceId,
    started: currentDate,
    lastActivity: currentDate,
  };

  if (stickySession) {
    saveSession(session);
  }

  return session;
}
