import { KnexInstrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { isOrchestrionInjected, knexChannelIntegration } from '@sentry/server-utils/orchestrion';

const INTEGRATION_NAME = 'Knex' as const;

export const instrumentKnex = generateInstrumentOnce(INTEGRATION_NAME, () => new KnexInstrumentation());

const _knexIntegration = (() => {
  // Decide in setup/setupOnce, not in the factory: the runtime channel injection runs inside `Sentry.init()`,
  // after the integrations array has already been built, so `isOrchestrionInjected()` is only
  // reliable by `setup`. When the diagnostics channels are injected (runtime hook or bundler
  // plugin), subscribe to them (the channel integration needs the client to register its
  // injection listener); otherwise fall back to the vendored OTel instrumentation.

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!isOrchestrionInjected()) {
        instrumentKnex();
      }
    },
    setup(client) {
      if (isOrchestrionInjected()) {
        knexChannelIntegration().setup?.(client);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Knex integration
 *
 * Capture tracing data for [Knex](https://knexjs.org/).
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *  integrations: [Sentry.knexIntegration()],
 * });
 * ```
 */
export const knexIntegration = defineIntegration(_knexIntegration);
