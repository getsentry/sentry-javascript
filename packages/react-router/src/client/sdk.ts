import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { applySdkMetadata, setTag } from '@sentry/core';

/**
 * Initializes the client side of the React Router SDK.
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'react-router', ['react-router', 'browser']);

  const client = browserInit(opts);

  setTag('runtime', 'browser');

  return client;
}
