import { getWorkerURL } from '@sentry-internal/replay-worker';
import { logger } from '@sentry/utils';

import { REPLAY_MAX_EVENT_BUFFER_SIZE } from '../constants';
import type { EventBuffer } from '../types';
import { EventBufferArray } from './EventBufferArray';
import { EventBufferProxy } from './EventBufferProxy';

interface CreateEventBufferParams {
  useCompression: boolean;
}

/**
 * Create an event buffer for replays.
 */
export function createEventBuffer({ useCompression }: CreateEventBufferParams): EventBuffer {
  // eslint-disable-next-line no-restricted-globals
  if (useCompression && window.Worker) {
    try {
      const workerUrl = getWorkerURL();

      __DEBUG_BUILD__ && logger.log('[Replay] Using compression worker');
      const worker = new Worker(workerUrl);
      return new EventBufferProxy(worker);
    } catch (error) {
      __DEBUG_BUILD__ && logger.log('[Replay] Failed to create compression worker');
      // Fall back to use simple event buffer array
    }
  }

  __DEBUG_BUILD__ && logger.log('[Replay] Using simple buffer');
  return new EventBufferArray();
}

/** This error indicates that the event buffer size exceeded the limit.. */
export class EventBufferSizeExceededError extends Error {
  public constructor() {
    super(`Event buffer exceeded maximum size of ${REPLAY_MAX_EVENT_BUFFER_SIZE}.`);
  }
}
