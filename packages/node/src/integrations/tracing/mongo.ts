import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _mongoIntegration = (() => {
  return {
    name: 'Mongo',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new MongoDBInstrumentation({
            responseHook(span) {
              addOriginToSpan(span, 'auto.db.otel.mongo');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * MongoDB integration
 *
 * Capture tracing data for MongoDB.
 */
export const mongoIntegration = defineIntegration(_mongoIntegration);
