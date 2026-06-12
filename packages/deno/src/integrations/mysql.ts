import { mysqlChannelIntegration } from '@sentry-internal/server-utils/orchestrion';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoMysql';

/**
 * Create spans for `mysql` queries under Deno.
 *
 * `mysql` channels are injected by the orchestrion runtime hook at load time.
 * The `@sentry/deno/import` loader must be active for this integration to
 * record anything.
 *
 * The channel-subscription logic is shared with the other server runtimes in
 * `@sentry-internal/server-utils`. This just installs Deno's
 * `AsyncLocalStorage` context strategy (so spans nest under the active
 * span and survive mysql's internal callback dispatch) before delegating.
 */
const _denoMysqlIntegration = (() => {
  const inner = mysqlChannelIntegration();
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();
      inner.setupOnce?.();
    },
  };
}) satisfies IntegrationFn;

export const denoMysqlIntegration = defineIntegration(_denoMysqlIntegration) as () => Integration & {
  name: 'DenoMysql';
  setupOnce: () => void;
};
