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
 * Initializes the Solid SDK with the given
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
