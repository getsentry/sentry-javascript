import type { Event } from '@sentry/types';

import { UNABLE_TO_SEND_REPLAY } from '../constants';
import type { ReplayContainer } from '../types';

/**
 * Determine if event should be sampled (only applies in buffer mode).
 */
export function shouldTrySampleEvent(replay: ReplayContainer, event: Event): boolean {
  if (replay.recordingMode !== 'buffer') {
    return false;
  }

  // ignore this error because otherwise we could loop indefinitely with
  // trying to capture replay and failing
  if (event.message === UNABLE_TO_SEND_REPLAY) {
    return false;
  }

  // Require the event to have an exception
  return !!event.exception;
}
