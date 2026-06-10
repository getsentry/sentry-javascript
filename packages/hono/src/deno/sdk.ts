import type { Client } from '@sentry/core';
import { applySdkMetadata, consoleSandbox, getClient } from '@sentry/core';
import { init as initDeno } from '@sentry/deno';
import type { HonoDenoOptions } from './middleware';
import { buildFilteredIntegrations } from '../shared/buildFilteredIntegrations';

/**
 * Initializes Sentry for Hono running in a Deno runtime environment.
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

  // Remove Hono from the SDK defaults to prevent double instrumentation: @sentry/deno
  const filteredOptions: HonoDenoOptions = {
    ...options,
    integrations: buildFilteredIntegrations(options.integrations, false),
  };

  return initDeno(filteredOptions);
}
