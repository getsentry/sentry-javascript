import { TediousInstrumentation } from '@opentelemetry/instrumentation-tedious';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/core';
import { generateInstrumentOnce } from '../../otel/instrument';

const TEDIUS_INSTRUMENTED_METHODS = new Set([
  'callProcedure',
  'execSql',
  'execSqlBatch',
  'execBulkLoad',
  'prepare',
  'execute',
]);

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
        const { description, data } = spanToJSON(span);
        // Tedius integration always set a span name and `db.system` attribute to `mssql`.
        if (!description || data?.['db.system'] !== 'mssql') {
          return;
        }

        const operation = description?.split(' ')[0] || '';
        if (TEDIUS_INSTRUMENTED_METHODS.has(operation)) {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.tedious');
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [tedious](https://www.npmjs.com/package/tedious) library.
 *
 * For more information, see the [`tediousIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/tedious/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.tediousIntegration()],
 * });
 * ```
 */
export const tediousIntegration = defineIntegration(_tediousIntegration);
