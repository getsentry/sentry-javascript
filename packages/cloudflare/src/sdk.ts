import type { Integration } from '@sentry/core';
import { vercelAIIntegration } from './integrations/tracing/vercelai';
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
  return [
    ...getBaseDefaultIntegrations(options),
    // Subscribes to the `ai` SDK's native `node:diagnostics_channel` telemetry channel.
    vercelAIIntegration(),
  ];
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  return initWithDefaultIntegrations(options, getDefaultIntegrations);
}
