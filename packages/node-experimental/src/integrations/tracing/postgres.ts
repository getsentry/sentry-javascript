import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _postgresIntegration = (() => {
  return {
    name: 'Postgres',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new PgInstrumentation({
            requireParentSpan: true,
            requestHook(span) {
              addOriginToSpan(span, 'auto.db.otel.postgres');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Postgres integration
 *
 * Capture tracing data for pg.
 */
export const postgresIntegration = defineIntegration(_postgresIntegration);
