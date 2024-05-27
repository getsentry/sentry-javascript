import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'Mysql';

export const instrumentMysql = generateInstrumentOnce(INTEGRATION_NAME, () => new MySQLInstrumentation({}));

const _mysqlIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMysql();
    },
  };
}) satisfies IntegrationFn;

/**
 * MySQL integration
 *
 * Capture tracing data for mysql.
 */
export const mysqlIntegration = defineIntegration(_mysqlIntegration);
