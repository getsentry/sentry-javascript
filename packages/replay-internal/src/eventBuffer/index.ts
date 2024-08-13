import { getWorkerURL } from '@sentry-internal/replay-worker';

import { DEBUG_BUILD } from '../debug-build';
import type { EventBuffer } from '../types';
import { logger } from '../util/logger';
import { EventBufferArray } from './EventBufferArray';
import { EventBufferProxy } from './EventBufferProxy';

interface CreateEventBufferParams {
  useCompression: boolean;
  workerUrl?: string;
}

// Treeshakable guard to remove the code of the included compression worker
declare const __SENTRY_EXCLUDE_REPLAY_WORKER__: boolean;

/**
 * Create an event buffer for replays.
 */
export function createEventBuffer({
  useCompression,
  workerUrl: customWorkerUrl,
}: CreateEventBufferParams): EventBuffer {
  if (
    useCompression &&
    // eslint-disable-next-line no-restricted-globals
    window.Worker
  ) {
    const worker = _loadWorker(customWorkerUrl);

    if (worker) {
      return worker;
    }
  }

  DEBUG_BUILD && logger.info('Using simple buffer');
  return new EventBufferArray();
}

function _loadWorker(customWorkerUrl?: string): EventBufferProxy | void {
  try {
    const workerUrl = customWorkerUrl || _getWorkerUrl();

    if (!workerUrl) {
      return;
    }

    DEBUG_BUILD && logger.info(`Using compression worker${customWorkerUrl ? ` from ${customWorkerUrl}` : ''}`);
    const worker = new Worker(workerUrl);
    return new EventBufferProxy(worker);
  } catch (error) {
    DEBUG_BUILD && logger.exception(error, 'Failed to create compression worker');
    // Fall back to use simple event buffer array
  }
}

function _getWorkerUrl(): string {
  if (typeof __SENTRY_EXCLUDE_REPLAY_WORKER__ === 'undefined' || !__SENTRY_EXCLUDE_REPLAY_WORKER__) {
    return getWorkerURL();
  }

  return '';
}
