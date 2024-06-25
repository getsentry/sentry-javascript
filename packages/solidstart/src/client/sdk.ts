import { applySdkMetadata, setTag } from '@sentry/core';
import type { BrowserOptions } from '@sentry/solid';
import { init as initSolidSDK } from '@sentry/solid';
import type { Client } from '@sentry/types';

/**
 * Initialize the client side of the Sentry SvelteKit SDK.
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'solidstart', ['solidstart', 'solid']);

  const client = initSolidSDK(opts);

  setTag('runtime', 'browser');

  return client;
}
