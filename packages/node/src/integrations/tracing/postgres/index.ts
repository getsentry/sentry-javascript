import { PgInstrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';

interface PostgresIntegrationOptions {
  ignoreConnectSpans?: boolean;
}

const INTEGRATION_NAME = 'Postgres';

export const instrumentPostgres = generateInstrumentOnce(
  INTEGRATION_NAME,
  PgInstrumentation,
  (options?: PostgresIntegrationOptions) => ({
    ignoreConnectSpans: options?.ignoreConnectSpans ?? false,
  }),
);

const _postgresIntegration = ((options?: PostgresIntegrationOptions) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentPostgres(options);
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
