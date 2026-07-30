import type { Worker } from 'node:worker_threads';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { addBreadcrumb, captureException, defineIntegration, isObjectLike } from '@sentry/core';

interface Options {
  /**
   * Whether to capture errors from worker threads.
   *
   * @default true
   */
  captureWorkerErrors?: boolean;
}

const INTEGRATION_NAME = 'Worker' as const;

/**
 * Capture breadcrumbs and events for worker threads.
 */
export const workerIntegration = defineIntegration((options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      diagnosticsChannel.channel('worker_threads').subscribe((event: unknown) => {
        if (isObjectLike(event) && 'worker' in event) {
          captureWorkerThreadEvents(event.worker as Worker, options);
        }
      });
    },
  };
});

function captureWorkerThreadEvents(worker: Worker, options: Options): void {
  let threadId: number | undefined;

  worker
    .on('online', () => {
      threadId = worker.threadId;
    })
    .on('error', error => {
      if (options.captureWorkerErrors !== false) {
        captureException(error, {
          mechanism: { type: 'auto.worker_thread', handled: false, data: { threadId: threadId !== undefined ? String(threadId) : undefined } },
        });
      } else {
        addBreadcrumb({
          category: 'worker_thread',
          message: `Worker thread errored with '${error.message}'`,
          level: 'error',
          data: { threadId },
        });
      }
    });
}
