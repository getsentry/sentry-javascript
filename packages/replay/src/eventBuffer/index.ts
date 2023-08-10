import { getWorkerURL } from '@sentry-internal/replay-worker';

import type { EventBuffer } from '../types';
import { logInfo } from '../util/log';
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

      logInfo('[Replay] Using compression worker');
      const worker = new Worker(workerUrl);
      return new EventBufferProxy(worker);
    } catch (error) {
      logInfo('[Replay] Failed to create compression worker');
      // Fall back to use simple event buffer array
    }
  }

  logInfo('[Replay] Using simple buffer');
  return new EventBufferArray();
}
