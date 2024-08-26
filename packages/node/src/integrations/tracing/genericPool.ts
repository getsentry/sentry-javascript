import { GenericPoolInstrumentation } from '@opentelemetry/instrumentation-generic-pool';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, spanToJSON } from '@sentry/core';
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
        if (spanJSON.description === 'generic-pool.aquire') {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.generic-pool');
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * GenericPool integration
 *
 * Capture tracing data for GenericPool.
 */
export const genericPoolIntegration = defineIntegration(_genericPoolIntegration);