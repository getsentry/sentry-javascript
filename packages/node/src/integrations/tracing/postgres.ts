import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';

const INTEGRATION_NAME = 'Postgres';

export const instrumentPostgres = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new PgInstrumentation({
      requireParentSpan: true,
      requestHook(span) {
        addOriginToSpan(span, 'auto.db.otel.postgres');
      },
    }),
);

const _postgresIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPostgres();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [pg](https://www.npmjs.com/package/pg) library.
 *
 * For more information, see the [`postgresIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/postgres/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.postgresIntegration()],
 * });
 * ```
 */
export const postgresIntegration = defineIntegration(_postgresIntegration);
