import type { Client } from '@sentry/core';
import { applySdkMetadata, consoleSandbox, getClient } from '@sentry/core';
import { init as initDeno } from '@sentry/deno';
import type { HonoDenoOptions } from './middleware';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';
import { LOW_QUALITY_TRANSACTION_PATTERNS } from '../shared/lowQualityTransactionPatterns';

/**
 * Initializes Sentry for Hono running in a Deno runtime environment.
 *
 * In general, it is recommended to initialize Sentry via the `sentry()` middleware, as it sets up everything by default and calls `init` internally.
 *
 * When manually calling `init`, add the `honoIntegration` to the `integrations` array to set up the Hono integration.
 */
export function init(options: HonoDenoOptions): Client | undefined {
  if (getClient()) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Sentry is already initialized. Sentry should only be initialized once, through the `sentry()` middleware. Remove the `Sentry.init()` call, if one exists.',
      );
    });
  }

  applySdkMetadata(options, 'hono', ['hono', 'deno']);

  const filteredOptions: HonoDenoOptions = {
    ...options,
    ignoreSpans: [...(options.ignoreSpans || []), ...LOW_QUALITY_TRANSACTION_PATTERNS],
    // Remove Hono from the SDK defaults to prevent double instrumentation: @sentry/deno
    integrations: buildFilteredIntegrations(options.integrations, false),
  };

  return initDeno(filteredOptions);
}
