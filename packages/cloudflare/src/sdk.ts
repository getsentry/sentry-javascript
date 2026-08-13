import type { Integration } from '@sentry/core';
import { getBaseDefaultIntegrations, initWithDefaultIntegrations } from './baseSdk';
import type { CloudflareClient, CloudflareOptions } from './client';
import { vercelAIIntegration } from '@sentry/server-utils/orchestrion';

/**
 * Get the default integrations for the Cloudflare SDK.
 */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  return [
    ...getBaseDefaultIntegrations(options),
    // Note: For now we add this directly here, in order for this to be here for vercel AI v7
    // Generally, we auto-inject integrations based on what orchestrion is using
    // however, for things with native channel support (like ai v7) we do not know about this
    // we'll fix this in a follow up, but for the time being vercelAIIntegration is added here
    // TODO: Remove this once we auto-inject integrations for native channels as well
    vercelAIIntegration(),
  ];
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  return initWithDefaultIntegrations(options, getDefaultIntegrations);
}
