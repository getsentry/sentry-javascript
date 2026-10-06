import { defineIntegration, type IntegrationFn } from '@sentry/core';

import { setShouldHandleError, type ShouldHandleError } from './errorFilter';
import { instrumentRemixV3 } from './instrument';

const INTEGRATION_NAME = 'RemixV3' as const;

interface RemixV3IntegrationOptions {
  /**
   * Decides which thrown values become issues. Return `false` to drop one. The default skips a numeric
   * `status` from 300 to 499. Aborted requests never reach this.
   */
  shouldHandleError?: ShouldHandleError;
}

const _remixV3Integration = ((options: RemixV3IntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      setShouldHandleError(options.shouldHandleError);

      // Usually a no-op: `createRouter()` runs while the app's modules are imported, before any
      // `init()`, so `--import @sentry/remix/v3/node` has already subscribed. This covers setups that
      // register the module hook from `init()` instead.
      instrumentRemixV3();
    },
  };
}) satisfies IntegrationFn;

/**
 * Names the `http.server` spans `@sentry/node` opens after the matched Remix 3 route, and reports the
 * errors the spans alone would not show.
 */
export const remixV3Integration = defineIntegration(_remixV3Integration);
