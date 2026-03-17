import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata, getIntegrationsToSetup } from '@sentry/core';
import { init as initNode } from '@sentry/node';
import type { HonoNodeOptions } from './middleware';
import { filterHonoIntegration } from '../shared/filterHonoIntegration';

/**
 * Initializes Sentry for Hono running in a Node runtime environment.
 *
 * In general, it is recommended to initialize Sentry via the `sentry()` middleware, as it sets up everything by default and calls `init` internally.
 *
 * When manually calling `init`, add the `honoIntegration` to the `integrations` array to set up the Hono integration.
 */
export function init(options: HonoNodeOptions): Client | undefined {
  applySdkMetadata(options, 'hono', ['hono', 'node']);

  const { integrations: userIntegrations } = options;

  // Remove Hono from the SDK defaults to prevent double instrumentation: @sentry/node
  const filteredOptions: HonoNodeOptions = {
    ...options,
    integrations: Array.isArray(userIntegrations)
      ? (defaults: Integration[]) =>
          getIntegrationsToSetup({
            defaultIntegrations: defaults.filter(filterHonoIntegration),
            integrations: userIntegrations, // user's explicit Hono integration is preserved
          })
      : typeof userIntegrations === 'function'
        ? (defaults: Integration[]) => userIntegrations(defaults.filter(filterHonoIntegration))
        : (defaults: Integration[]) => defaults.filter(filterHonoIntegration),
  };

  return initNode(filteredOptions);
}
