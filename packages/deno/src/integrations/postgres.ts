import { postgresChannelIntegration } from '@sentry/server-utils/orchestrion';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoPostgres' as const;

interface DenoPostgresIntegrationOptions {
  /** Whether to skip creating spans for `pg`/`pg-pool` connections. Defaults to `false`. */
  ignoreConnectSpans?: boolean;
}

/**
 * Create spans for `pg` (node-postgres) queries under Deno.
 *
 * `pg` channels are injected by the orchestrion runtime hook at load time.
 * The `@sentry/deno/import` loader must be active for this integration to
 * record anything.
 *
 * The channel-subscription logic is shared with the other server runtimes in
 * `@sentry/server-utils`. This just installs Deno's
 * `AsyncLocalStorage` context strategy (so spans nest under the active
 * span and survive pg's internal callback dispatch) before delegating.
 */
const _denoPostgresIntegration = ((options?: DenoPostgresIntegrationOptions) => {
  const inner = postgresChannelIntegration(options);

  return extendIntegration(inner, {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();
    },
  });
}) satisfies IntegrationFn;

export const denoPostgresIntegration = defineIntegration(_denoPostgresIntegration);
