import { defineIntegration, type IntegrationFn } from '@sentry/core';

import { instrumentRemixV3 } from './instrument';

const INTEGRATION_NAME = 'RemixV3' as const;

const _remixV3Integration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Usually a no-op: `createRouter()` runs while the app's modules are imported, before any
      // `init()`, so `--import @sentry/remix/v3/node` has already subscribed. This covers setups that
      // register the module hook from `init()` instead.
      instrumentRemixV3();
    },
  };
}) satisfies IntegrationFn;

/**
 * Names the `http.server` spans `@sentry/node` opens after the matched Remix 3 route.
 */
export const remixV3Integration = defineIntegration(_remixV3Integration);
