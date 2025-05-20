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
 * Initialize a Svelte client with the provided options and default integrations getter function.
 * This is an internal method the SDK uses under the hood to set up things - you should not use this as a user!
 * Instead, use `init()` to initialize the SDK.
 *
 * @hidden
 * @internal
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
