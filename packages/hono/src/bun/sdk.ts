import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata, getIntegrationsToSetup } from '@sentry/core';
import { init as initBun } from '@sentry/bun';
import type { HonoBunOptions } from './middleware';
import { filterHonoIntegration } from '../shared/filterHonoIntegration';

/**
 * Initializes Sentry for Hono running in a Bun runtime environment.
 *
 * In general, it is recommended to initialize Sentry via the `sentry()` middleware, as it sets up everything by default and calls `init` internally.
 *
 * When manually calling `init`, add the `honoIntegration` to the `integrations` array to set up the Hono integration.
 */
export function init(options: HonoBunOptions): Client | undefined {
  applySdkMetadata(options, 'hono', ['hono', 'bun']);

  const { integrations: userIntegrations } = options;

  // Remove Hono from the SDK defaults to prevent double instrumentation: @sentry/bun
  const filteredOptions: HonoBunOptions = {
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

  return initBun(filteredOptions);
}
