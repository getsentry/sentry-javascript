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
 * Initialize a React client with the provided options and default integrations getter function.
 * This is an internal method the SDK uses under the hood to set up things - you should not use this as a user!
 * Instead, use `init()` to initialize the SDK.
 *
 * @hidden
 * @internal
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
