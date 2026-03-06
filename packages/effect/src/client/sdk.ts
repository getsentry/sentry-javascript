import type { BrowserOptions } from '@sentry/browser';
import { init as initBrowser } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';

/**
 * Initializes the Sentry Effect SDK for browser clients.
 *
 * @param options - Configuration options for the SDK
 * @returns The initialized Sentry client, or undefined if initialization failed
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'effect', ['effect', 'browser']);

  return initBrowser(opts);
}
