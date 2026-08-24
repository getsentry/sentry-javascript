import type { Integration } from '@sentry/core';
import { getBaseDefaultIntegrations, initWithDefaultIntegrations } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';

/**
 * Get the default integrations for the Cloudflare SDK.
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
