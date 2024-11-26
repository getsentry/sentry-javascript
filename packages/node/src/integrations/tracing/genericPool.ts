import { GenericPoolInstrumentation } from '@opentelemetry/instrumentation-generic-pool';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'GenericPool';

export const instrumentGenericPool = generateInstrumentOnce(INTEGRATION_NAME, () => new GenericPoolInstrumentation({}));

const _genericPoolIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentGenericPool();
    },

    setup(client) {
      client.on('spanStart', span => {
        const spanJSON = spanToJSON(span);

        const spanDescription = spanJSON.description;

        // typo in emitted span for version <= 0.38.0 of @opentelemetry/instrumentation-generic-pool
        const isGenericPoolSpan =
          spanDescription === 'generic-pool.aquire' || spanDescription === 'generic-pool.acquire';

        if (isGenericPoolSpan) {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.generic_pool');
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [generic-pool](https://www.npmjs.com/package/generic-pool) library.
 *
 * For more information, see the [`genericPoolIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/genericpool/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.genericPoolIntegration()],
 * });
 * ```
 */
export const genericPoolIntegration = defineIntegration(_genericPoolIntegration);
