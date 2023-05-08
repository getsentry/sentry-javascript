import type { Event } from '@sentry/types';

import { UNABLE_TO_SEND_REPLAY } from '../../constants';
import type { ReplayContainer } from '../../types';
import { isSampled } from '../../util/isSampled';

/**
 * Determine if event should be sampled (only applies in buffer mode).
 * When an event is captured by `hanldleGlobalEvent`, when in buffer mode
 * we determine if we want to sample the error or not.
 */
export function shouldSampleForBufferEvent(replay: ReplayContainer, event: Event): boolean {
  if (replay.recordingMode !== 'buffer') {
    return false;
  }

  // ignore this error because otherwise we could loop indefinitely with
  // trying to capture replay and failing
  if (event.message === UNABLE_TO_SEND_REPLAY) {
    return false;
  }

  // Require the event to be an error event & to have an exception
  if (!event.exception || event.type) {
    return false;
  }

  return isSampled(replay.getOptions().errorSampleRate);
}
