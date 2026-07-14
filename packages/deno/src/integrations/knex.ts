import { knexChannelIntegration } from '@sentry/server-utils/orchestrion';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoKnex' as const;

/**
 * Create spans for `knex` queries under Deno.
 *
 * `knex` channels are injected by the orchestrion runtime hook at load time.
 * The `@sentry/deno/import` loader must be active for this integration to
 * record anything.
 *
 * The channel-subscription logic is shared with the other server runtimes in
 * `@sentry/server-utils`. This just installs Deno's
 * `AsyncLocalStorage` context strategy (so spans nest under the active
 * span and survive knex's internal callback dispatch) before delegating.
 */
const _denoKnexIntegration = (() => {
  const inner = knexChannelIntegration();

  return extendIntegration(inner, {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();
    },
  });
}) satisfies IntegrationFn;

export const denoKnexIntegration = defineIntegration(_denoKnexIntegration) as () => Integration & {
  name: 'DenoKnex';
  setupOnce: () => void;
};
