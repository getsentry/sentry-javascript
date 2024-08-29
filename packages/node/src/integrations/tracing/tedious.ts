import { TediousInstrumentation } from '@opentelemetry/instrumentation-tedious';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'Tedious';

export const instrumentTedious = generateInstrumentOnce(INTEGRATION_NAME, () => new TediousInstrumentation({}));

const _tediousIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentTedious();
    },

    setup(client) {
      client.on('spanStart', span => {
        const spanJSON = spanToJSON(span);

        const spanMethods = ['callProcedure', 'execSql', 'execSqlBatch', 'execBulkLoad', 'prepare', 'execute'];

        const spanDescription = spanJSON?.description;

        if (spanMethods.some(method => spanDescription?.startsWith(method))) {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.tedious');
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Tedious integration
 *
 * Capture tracing data for tedious.
 */
export const tediousIntegration = defineIntegration(_tediousIntegration);
