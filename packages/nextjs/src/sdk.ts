import { ReportDialogOptions } from '@sentry/browser';
import { getCurrentHub } from '@sentry/node';

import { NextjsClientInterface } from './common/nextjsClient';
import { NextjsOptions } from './common/nextjsOptions';
import { dynamicRequireNextjsModule } from './utils';

/**
 * The Sentry NextJS SDK Client.
 *
 * TODO: docs, examples...
 *
 */
export function init(initOptions: NextjsOptions): void {
  // eslint-disable-next-line no-console
  console.log('Initializing NextJS...');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  dynamicRequireNextjsModule().init(initOptions);
}

/**
 * Present the user with a report dialog.
 *
 * @param dialogOptions Everything is optional, we try to fetch all the info we need from the global scope.
 */
export function showReportDialog(dialogOptions: ReportDialogOptions = {}): void {
  const client = getCurrentHub().getClient<NextjsClientInterface>();
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
  const client = getCurrentHub().getClient<NextjsClientInterface>();
  return client ? client.flush(timeout) : Promise.reject(false);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export async function close(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NextjsClientInterface>();
  return client ? client.close(timeout) : Promise.reject(false);
}
