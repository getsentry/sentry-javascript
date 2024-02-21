import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): void {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'react');

  browserInit(opts);
}
