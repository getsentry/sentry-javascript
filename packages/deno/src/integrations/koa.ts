import { koaChannelIntegration } from '@sentry/server-utils/orchestrion';
import type { Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';

const INTEGRATION_NAME = 'DenoKoa' as const;

/**
 * Create spans for `koa` middleware/router layers under Deno. Requires the
 * `@sentry/deno/import` loader. Delegates to the shared subscriber in
 * `@sentry/server-utils`, adding Deno's `AsyncLocalStorage` context strategy so
 * spans nest under the active HTTP server span.
 */
const _denoKoaIntegration = (() => {
  const inner = koaChannelIntegration();

  return extendIntegration(inner, {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();
    },
  });
}) satisfies IntegrationFn;

export const denoKoaIntegration = defineIntegration(_denoKoaIntegration) as () => Integration & {
  name: 'DenoKoa';
  setupOnce: () => void;
};
