import type { Integration } from '@sentry/core';
import { getBaseDefaultIntegrations, initWithDefaultIntegrations } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';

/**
 * Get the default integrations for the Cloudflare SDK.
 *
 * This is the full set and requires the `nodejs_compat` compatibility flag. Runtimes that cannot
 * enable it (e.g. Shopify Oxygen) go through `wrapRequestHandler`, which only sets up
 * `getBaseDefaultIntegrations`.
 */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  return getBaseDefaultIntegrations(options);
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  return initWithDefaultIntegrations(options, getDefaultIntegrations);
}
