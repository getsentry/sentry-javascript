import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _postgresIntegration = (() => {
  return {
    name: 'Postgres',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new PgInstrumentation({
          requireParentSpan: true,
          requestHook(span) {
            addOriginToSpan(span, 'auto.db.otel.postgres');
          },
        }),
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * Postgres integration
 *
 * Capture tracing data for pg.
 */
export const postgresIntegration = defineIntegration(_postgresIntegration);
