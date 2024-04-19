import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { defineIntegration } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/opentelemetry';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _mongoIntegration = (() => {
  return {
    name: 'Mongo',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new MongoDBInstrumentation({
          responseHook(span) {
            addOriginToSpan(span, 'auto.db.otel.mongo');
          },
        }),
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * MongoDB integration
 *
 * Capture tracing data for MongoDB.
 */
export const mongoIntegration = defineIntegration(_mongoIntegration);
