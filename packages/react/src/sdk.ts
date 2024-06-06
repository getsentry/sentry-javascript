import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, setContext } from '@sentry/browser';
import { applySdkMetadata } from '@sentry/core';

import { version } from 'react';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): void {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'react');
  setContext('react', { version });
  browserInit(opts);
}
