import { mongodbChannelIntegration } from '@sentry/server-utils/orchestrion';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoMongo' as const;

/**
 * Create spans for `mongodb` queries under Deno.
 *
 * `mongodb` channels are injected by the orchestrion runtime hook at load time.
 * The `@sentry/deno/import` loader must be active for this integration to
 * record anything.
 *
 * The channel-subscription logic is shared with the other server runtimes in
 * `@sentry/server-utils`. This just installs Deno's
 * `AsyncLocalStorage` context strategy (so spans nest under the active
 * span and survive mongodb's internal callback dispatch) before delegating.
 */
const _denoMongoIntegration = (() => {
  const inner = mongodbChannelIntegration();

  return extendIntegration(inner, {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();
    },
  });
}) satisfies IntegrationFn;

export const denoMongoIntegration = defineIntegration(_denoMongoIntegration) as () => Integration & {
  name: 'DenoMongo';
  setupOnce: () => void;
};
