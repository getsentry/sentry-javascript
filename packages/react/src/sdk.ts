import type { BrowserOptions } from '@sentry/browser';
import {
  init as browserInit,
  normalizeStringifyValue as browserNormalizeStringifyValue,
  setContext,
} from '@sentry/browser';
import type { Client } from '@sentry/core/browser';
import { applySdkMetadata, setNormalizeStringifier } from '@sentry/core/browser';
import { version } from 'react';
import { isSyntheticEvent } from './isSyntheticEvent';

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
  setNormalizeStringifier(normalizeStringifyValue);

  return client;
}

function normalizeStringifyValue(value: Exclude<unknown, string | number | boolean | null>): string | undefined {
  if (isSyntheticEvent(value)) {
    return '[SyntheticEvent]';
  }
  return browserNormalizeStringifyValue(value);
}
