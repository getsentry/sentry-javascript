import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { _INTERNAL_captureOptionsSetByUser, applySdkMetadata } from '@sentry/core';
/**
 * Inits the Svelte SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ..._INTERNAL_captureOptionsSetByUser(options),
  };

  applySdkMetadata(opts, 'svelte');

  return browserInit(opts);
}
