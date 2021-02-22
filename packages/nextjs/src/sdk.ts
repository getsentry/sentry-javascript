import { ReportDialogOptions } from '@sentry/browser';
import { getCurrentHub } from '@sentry/node';
import { dynamicRequire } from '@sentry/utils';

import { NextjsClient } from './common/NextjsClient';
import { NextjsOptions } from './common/NextjsOptions';

/**
 * The Sentry NextJS SDK Client.
 *
 * TODO: docs, examples...
 *
 */
export function init(initOptions: NextjsOptions): void {
  if (isRunningInNode()) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    dynamicRequire(module, 'node module').init(initOptions); // TODO: init correct node module
  } else {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    dynamicRequire(module, 'browser module').init(initOptions); // TODO: init correct node module
  }
}

/** Returns whether this is being run in Node. */
function isRunningInNode(): boolean {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
}

/**
 * Present the user with a report dialog.
 *
 * @param dialogOptions Everything is optional, we try to fetch all the info we need from the global scope.
 */
export function showReportDialog(dialogOptions: ReportDialogOptions = {}): void {
  const client = getCurrentHub().getClient<NextjsClient>();
  if (client) {
    client.showReportDialog(dialogOptions);
  }
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NextjsClient>();
  return client ? client.flush(timeout) : Promise.reject(false);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function close(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NextjsClient>();
  return client ? client.close(timeout) : Promise.reject(false);
}
