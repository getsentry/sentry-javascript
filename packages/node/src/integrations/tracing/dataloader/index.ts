import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { dataloaderChannelIntegration, isOrchestrionInjected } from '@sentry/server-utils/orchestrion';
import { DataloaderInstrumentation } from './vendored/instrumentation';

const INTEGRATION_NAME = 'Dataloader' as const;

export const instrumentDataloader = generateInstrumentOnce(INTEGRATION_NAME, () => new DataloaderInstrumentation());

const _dataloaderIntegration = (() => {
  // Decide in setup/setupOnce, not in the factory: the runtime channel injection runs inside `Sentry.init()`,
  // after the integrations array has already been built, so `isOrchestrionInjected()` is only
  // reliable by `setup`. When the diagnostics channels are injected (runtime hook or bundler
  // plugin), subscribe to them (the channel integration needs the client to register its
  // injection listener); otherwise fall back to the vendored OTel instrumentation.

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!isOrchestrionInjected()) {
        instrumentDataloader();
      }
    },
    setup(client) {
      if (isOrchestrionInjected()) {
        dataloaderChannelIntegration().setup?.(client);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [dataloader](https://www.npmjs.com/package/dataloader) library.
 *
 * For more information, see the [`dataloaderIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/dataloader/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.dataloaderIntegration()],
 * });
 * ```
 */
export const dataloaderIntegration = defineIntegration(_dataloaderIntegration);
