import type { Client } from '@sentry/core';
import { applySdkMetadata, consoleSandbox, getClient } from '@sentry/core';
import { init as initBun } from '@sentry/bun';
import type { HonoBunOptions } from './middleware';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';

/**
 * Initializes Sentry for Hono running in a Bun runtime environment.
 *
 * In general, it is recommended to initialize Sentry via the `sentry()` middleware, as it sets up everything by default and calls `init` internally.
 *
 * When manually calling `init`, add the `honoIntegration` to the `integrations` array to set up the Hono integration.
 */
export function init(options: HonoBunOptions): Client | undefined {
  if (getClient()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Sentry is already initialized. Sentry should only be initialized once, through the `sentry()` middleware. Remove the `Sentry.init()` call, if one exists.',
      );
    });
  }

  applySdkMetadata(options, 'hono', ['hono', 'bun']);

  // Remove Hono from the SDK defaults to prevent double instrumentation: @sentry/bun
  const filteredOptions: HonoBunOptions = {
    ...options,
    integrations: buildFilteredIntegrations(options.integrations, false),
  };

  return initBun(filteredOptions);
}
