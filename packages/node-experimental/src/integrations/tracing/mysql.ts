import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const _mysqlIntegration = (() => {
  return {
    name: 'Mysql',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new MySQLInstrumentation({})],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * MySQL integration
 *
 * Capture tracing data for mysql.
 */
export const mysqlIntegration = defineIntegration(_mysqlIntegration);
