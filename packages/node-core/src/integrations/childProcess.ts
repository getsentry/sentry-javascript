import type { ChildProcess } from 'node:child_process';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Worker } from 'node:worker_threads';
import { addBreadcrumb, captureException, defineIntegration } from '@sentry/core';

interface Options {
  /**
   * Whether to include child process arguments in breadcrumbs data.
   *
   * @default false
   */
  includeChildProcessArgs?: boolean;

  /**
   * Whether to capture errors from worker threads.
   *
   * @default true
   */
  captureWorkerErrors?: boolean;
}

const INTEGRATION_NAME = 'ChildProcess';

/**
 * Capture breadcrumbs and events for child processes and worker threads.
 */
export const childProcessIntegration = defineIntegration((options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      diagnosticsChannel.channel('child_process').subscribe((event: unknown) => {
        if (event && typeof event === 'object' && 'process' in event) {
          captureChildProcessEvents(event.process as ChildProcess, options);
        }
      });

      diagnosticsChannel.channel('worker_threads').subscribe((event: unknown) => {
        if (event && typeof event === 'object' && 'worker' in event) {
          captureWorkerThreadEvents(event.worker as Worker, options);
        }
      });
    },
  };
});

function captureChildProcessEvents(child: ChildProcess, options: Options): void {
  let hasExited = false;
  let data: Record<string, unknown> | undefined;

  child
    .on('spawn', () => {
      // This is Sentry getting macOS OS context
      if (child.spawnfile === '/usr/bin/sw_vers') {
        hasExited = true;
        return;
      }

      data = { spawnfile: child.spawnfile };
      if (options.includeChildProcessArgs) {
        data.spawnargs = child.spawnargs;
      }
    })
    .on('exit', code => {
      if (!hasExited) {
        hasExited = true;

        // Only log for non-zero exit codes
        if (code !== null && code !== 0) {
          addBreadcrumb({
            category: 'child_process',
            message: `Child process exited with code '${code}'`,
            level: code === 0 ? 'info' : 'warning',
            data,
          });
        }
      }
    })
    .on('error', error => {
      if (!hasExited) {
        hasExited = true;

        addBreadcrumb({
          category: 'child_process',
          message: `Child process errored with '${error.message}'`,
          level: 'error',
          data,
        });
      }
    });
}

function captureWorkerThreadEvents(worker: Worker, options: Options): void {
  let threadId: number | undefined;

  worker
    .on('online', () => {
      threadId = worker.threadId;
    })
    .on('error', error => {
      if (options.captureWorkerErrors !== false) {
        captureException(error, {
          mechanism: { type: 'auto.child_process.worker_thread', handled: false, data: { threadId: String(threadId) } },
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
