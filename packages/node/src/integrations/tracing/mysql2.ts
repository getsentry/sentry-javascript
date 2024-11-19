import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Mysql2';

export const instrumentMysql2 = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MySQL2Instrumentation({
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mysql2');
      },
    }),
);

const _mysql2Integration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMysql2();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [mysql2](https://www.npmjs.com/package/mysql2) library.
 *
 * For more information, see the [`mysql2Integration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/mysql2/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.mysqlIntegration()],
 * });
 * ```
 */
export const mysql2Integration = defineIntegration(_mysql2Integration);
