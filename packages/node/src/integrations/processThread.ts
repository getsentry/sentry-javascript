import type { ChildProcess } from 'node:child_process';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Worker } from 'node:worker_threads';
import { addBreadcrumb, defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

interface Options {
  /**
   * Whether to include child process arguments in breadcrumbs data.
   *
   * @default false
   */
  includeChildProcessArgs?: boolean;
}

const INTEGRATION_NAME = 'ProcessAndThreadBreadcrumbs';

const _processThreadBreadcrumbIntegration = ((options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(_client) {
      // eslint-disable-next-line deprecation/deprecation
      diagnosticsChannel.channel('child_process').subscribe((event: unknown) => {
        if (event && typeof event === 'object' && 'process' in event) {
          captureChildProcessEvents(event.process as ChildProcess, options);
        }
      });

      // eslint-disable-next-line deprecation/deprecation
      diagnosticsChannel.channel('worker_threads').subscribe((event: unknown) => {
        if (event && typeof event === 'object' && 'worker' in event) {
          captureWorkerThreadEvents(event.worker as Worker);
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Capture breadcrumbs for child process and thread creation, exit and error.
 */
export const processThreadBreadcrumbIntegration = defineIntegration(_processThreadBreadcrumbIntegration);

function captureChildProcessEvents(child: ChildProcess, options: Options): void {
  let hasExited = false;
  let data: Record<string, unknown> | undefined;

  child.on('spawn', () => {
    // This is Sentry getting macOS OS context
    if (child.spawnfile === '/usr/bin/sw_vers') {
      hasExited = true;
      return;
    }

    data = { spawnfile: child.spawnfile };
    if (options.includeChildProcessArgs) {
      data.spawnargs = child.spawnargs;
    }

    addBreadcrumb({
      category: 'child_process',
      message: 'Child process spawned',
      level: 'info',
      data,
    });
  });

  child.on('exit', (code, signal) => {
    if (!hasExited) {
      hasExited = true;

      let message = 'Child process exited';
      if (code !== null) {
        message += ` with code '${code}'`;
      }
      if (signal !== null) {
        message += ` with signal '${signal}'`;
      }

      addBreadcrumb({
        category: 'child_process',
        message,
        level: code !== 0 ? 'warning' : 'info',
        data,
      });
    }
  });

  child.on('error', error => {
    if (!hasExited) {
      hasExited = true;

      addBreadcrumb({
        category: 'child_process',
        message: `Child process errored with ${error.message}`,
        level: 'error',
        data,
      });
    }
  });
}

function captureWorkerThreadEvents(worker: Worker): void {
  let threadId: number | undefined;

  worker
    .on('online', () => {
      threadId = worker.threadId;

      addBreadcrumb({
        category: 'worker_thread',
        message: 'Worker thread online',
        level: 'info',
        data: { threadId },
      });
    })
    .on('exit', code => {
      addBreadcrumb({
        category: 'worker_thread',
        message: `Worker thread exited with code '${code}'`,
        level: code !== 0 ? 'warning' : 'info',
        data: { threadId },
      });
    })
    .on('error', error => {
      addBreadcrumb({
        category: 'worker_thread',
        message: `Worker thread errored with ${error.message}`,
        level: 'error',
        data: { threadId },
      });
    });
}
