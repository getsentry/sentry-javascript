import type { BrowserOptions } from '@sentry/browser';
import { init as browserInit, setContext } from '@sentry/browser';
import type { Client } from '@sentry/core/browser';
import {
  applySdkMetadata,
  getStackAsyncContextStrategy,
  isSyntheticEvent,
  setAsyncContextStrategy,
} from '@sentry/core/browser';
import { normalizeStringifyValue as browserNormalizeStringifyValue } from '@sentry-internal/browser-utils';
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
  const client = browserInit(opts);

  // Add react-specific stringification
  setAsyncContextStrategy({
    ...getStackAsyncContextStrategy(),
    normalizeStringifyValue,
  });

  return client;
}

function normalizeStringifyValue(value: Exclude<unknown, string | number | boolean | null>): string | undefined {
  if (isSyntheticEvent(value)) {
    return '[SyntheticEvent]';
  }
  return browserNormalizeStringifyValue(value);
}
