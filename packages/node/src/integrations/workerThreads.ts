import type { Worker } from 'node:worker_threads';
import { captureException, defineIntegration, isObjectLike } from '@sentry/core';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';

const INTEGRATION_NAME = 'WorkerThreads' as const;

/**
 * Capture events and errors of worker threads.
 * For child process events, use `childProcessIntegration()` instead.
 */
export const workerThreadsIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      subscribeDiagnosticsChannel('worker_threads', (event: unknown) => {
        if (isObjectLike(event) && 'worker' in event) {
          captureWorkerThreadEvents(event.worker as Worker);
        }
      });
    },
  };
});

function captureWorkerThreadEvents(worker: Worker): void {
  let threadId: number | undefined;

  worker
    .on('online', () => {
      threadId = worker.threadId;
    })
    .on('error', error => {
      captureException(error, {
        mechanism: {
          type: 'auto.node.worker_threads',
          handled: false,
          data: threadId !== undefined ? { threadId: String(threadId) } : undefined,
        },
      });
    });
}
