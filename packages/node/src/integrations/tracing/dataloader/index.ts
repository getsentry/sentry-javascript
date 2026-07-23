import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { dataloaderChannelIntegration, isOrchestrionInjected } from '@sentry/server-utils/orchestrion';
import { DataloaderInstrumentation } from './vendored/instrumentation';

const INTEGRATION_NAME = 'Dataloader' as const;

export const instrumentDataloader = generateInstrumentOnce(INTEGRATION_NAME, () => new DataloaderInstrumentation());

const _dataloaderIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Decide here, not in the factory: the runtime channel injection runs inside `Sentry.init()`,
      // after the integrations array has already been built, so `isOrchestrionInjected()` is only
      // reliable by `setupOnce`. When the diagnostics channels are injected (runtime hook or bundler
      // plugin), subscribe to them; otherwise fall back to the vendored OTel instrumentation.
      if (isOrchestrionInjected()) {
        dataloaderChannelIntegration().setupOnce?.();
      } else {
        instrumentDataloader();
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
