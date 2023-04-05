import { getWorkerURL } from '@sentry-internal/replay-worker';
import { logger } from '@sentry/utils';

import type { EventBuffer, ReplayEventCompressor } from '../types';
import { EventBufferArray } from './EventBufferArray';
import { EventBufferProxy } from './EventBufferProxy';

interface CreateEventBufferParams {
  useCompression: boolean | ReplayEventCompressor;
}

/**
 * Create an event buffer for replays.
 */
export function createEventBuffer({ useCompression }: CreateEventBufferParams): EventBuffer {
  // eslint-disable-next-line no-restricted-globals
  if (useCompression === true && window.Worker) {
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
  return new EventBufferArray({ compressor: typeof useCompression === 'function' ? useCompression : undefined });
}
