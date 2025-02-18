import type { BrowserClient, BrowserOptions } from '@sentry/browser';
import {
  getDefaultIntegrations,
  initWithDefaultIntegrations as browserInitWithDefaultIntegrations,
} from '@sentry/browser';
import type { Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';

/**
 * Initializes the Solid SDK.
 */
export function init(options: BrowserOptions): BrowserClient | undefined {
  return initWithDefaultIntegrations(options, getDefaultIntegrations);
}

/**
 * Initialize a Solid client with the provided options and default integrations getter function.
 * This is an internal method the SDK uses under the hood to set up things - you should not use this as a user!
 * Instead, use `init()` to initialize the SDK.
 *
 * @hidden
 * @internal
 */
export function initWithDefaultIntegrations(
  options: BrowserOptions,
  getDefaultIntegrations: (options: BrowserOptions) => Integration[],
): BrowserClient | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'solid');

  return browserInitWithDefaultIntegrations(opts, getDefaultIntegrations);
}
