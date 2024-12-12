import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';
import type { Client } from '@sentry/core';

/**
 * Initializes the Solid SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'solid');

  return browserInit(opts);
}
