import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';

/**
 * Initializes the SolidJS SDK
 */
export function init(options: BrowserOptions): void {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'solidjs');

  browserInit(opts);
}
