import type { BrowserOptions } from '@sentry/browser';
import {
  init as browserInit,
  initWithDefaultIntegrations as browserInitWithDefaultIntegrations,
  setContext,
} from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';

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

/**
 * Init the React SDK with the given default integrations getter function.
 */
export function initWithDefaultIntegrations(
  options: BrowserOptions,
  defaultIntegrations: (options: BrowserOptions) => Integration[],
): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'react');
  setContext('react', { version });
  return browserInitWithDefaultIntegrations(opts, defaultIntegrations);
}
