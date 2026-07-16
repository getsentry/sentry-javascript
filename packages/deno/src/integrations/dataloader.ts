import { dataloaderChannelIntegration } from '@sentry/server-utils/orchestrion';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoDataloader' as const;

/**
 * Create spans for `dataloader` load/batch operations under Deno.
 *
 * `dataloader` channels are injected by the orchestrion runtime hook at load time.
 * The `@sentry/deno/import` loader must be active for this integration to
 * record anything.
 *
 * The channel-subscription logic is shared with the other server runtimes in
 * `@sentry/server-utils`. This just installs Deno's `AsyncLocalStorage` context
 * strategy (so spans nest under the active span and survive dataloader's deferred
 * batch dispatch) before delegating.
 */
const _denoDataloaderIntegration = (() => {
  const inner = dataloaderChannelIntegration();

  return extendIntegration(inner, {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();
    },
  });
}) satisfies IntegrationFn;

export const denoDataloaderIntegration = defineIntegration(_denoDataloaderIntegration) as () => Integration & {
  name: 'DenoDataloader';
  setupOnce: () => void;
};
