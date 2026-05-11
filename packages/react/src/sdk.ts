import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, setContext } from '@sentry/browser';
import type { Client } from '@sentry/core/browser';
import { applySdkMetadata } from '@sentry/core/browser';
import { version } from 'react';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'react');
  setContext('react', { version });
  return browserInit(opts);
}
