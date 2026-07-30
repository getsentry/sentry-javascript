import type { ChildProcess } from 'node:child_process';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { addBreadcrumb, defineIntegration, isObjectLike } from '@sentry/core';

interface Options {
  /**
   * Whether to include child process arguments in breadcrumbs data.
   *
   * @default false
   */
  includeChildProcessArgs?: boolean;
}

const INTEGRATION_NAME = 'ChildProcess' as const;

/**
 * Capture breadcrumbs and events for child processes.
 *
 * For worker thread events, use `workerIntegration()` instead.
 */
export const childProcessIntegration = defineIntegration((options: Options = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup() {
      diagnosticsChannel.channel('child_process').subscribe((event: unknown) => {
        if (isObjectLike(event) && 'process' in event) {
          captureChildProcessEvents(event.process as ChildProcess, options);
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
            level: 'warning',
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

