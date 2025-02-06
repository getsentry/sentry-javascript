import type { BrowserOptions } from '@sentry/browser';
import {
  getDefaultIntegrations,
  initWithDefaultIntegrations as browserInitWithDefaultIntegrations,
} from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';

/**
 * Inits the Svelte SDK
 */
export function init(options: BrowserOptions): Client | undefined {
  return initWithDefaultIntegrations(options, getDefaultIntegrations);
}

/**
 * Inits the Svelte SDK with the given default integrations getter function.
 */
export function initWithDefaultIntegrations(
  options: BrowserOptions,
  getDefaultIntegrations: (options: BrowserOptions) => Integration[],
): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'svelte');

  return browserInitWithDefaultIntegrations(opts, getDefaultIntegrations);
}
