import { mysqlChannelIntegration } from '@sentry/server-utils/orchestrion';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';

const INTEGRATION_NAME = 'CloudflareMysql';

/**
 * Create spans for `mysql` queries in Cloudflare Workers.
 *
 * The `mysql` channels are injected by the orchestrion Vite plugin at build
 * time. The `@sentry/cloudflare/vite` plugin must be active in the Vite config
 * for this integration to record anything.
 *
 * The channel-subscription logic is shared with the other server runtimes in
 * `@sentry/server-utils`. The `AsyncLocalStorage` context strategy this relies
 * on (so spans nest under the active span and survive mysql's internal callback
 * dispatch) is already installed by `withSentry` before any request runs — we
 * must not re-install it here. `setupOnce` runs once per isolate, on the first
 * request; swapping the strategy mid-request would orphan that request's
 * already-established isolation scope.
 */
const _cloudflareMysqlIntegration = (() => {
  const inner = mysqlChannelIntegration();
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      inner.setupOnce?.();
    },
  };
}) satisfies IntegrationFn;

export const cloudflareMysqlIntegration = defineIntegration(_cloudflareMysqlIntegration) as () => Integration & {
  name: 'CloudflareMysql';
  setupOnce: () => void;
};
