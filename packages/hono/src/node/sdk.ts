import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { HonoNodeOptions } from './middleware';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';

/**
 * Initializes Sentry for Hono running in a Node runtime environment.
 *
 * In general, it is recommended to initialize Sentry via the `sentry()` middleware, as it sets up everything by default and calls `init` internally.
 *
 * When manually calling `init`, add the `honoIntegration` to the `integrations` array to set up the Hono integration.
 */
export function init(options: HonoNodeOptions): Client | undefined {
  applySdkMetadata(options, 'hono', ['hono', 'node']);

  // Remove Hono from the SDK defaults to prevent double instrumentation: @sentry/node
  const filteredOptions: HonoNodeOptions = {
    ...options,
    integrations: buildFilteredIntegrations(options.integrations, false),
  };

  return initNode(filteredOptions);
}
