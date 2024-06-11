import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Mongo';

export const instrumentMongo = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MongoDBInstrumentation({
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mongo');
      },
    }),
);

const _mongoIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMongo();
    },
  };
}) satisfies IntegrationFn;

/**
 * MongoDB integration
 *
 * Capture tracing data for MongoDB.
 */
export const mongoIntegration = defineIntegration(_mongoIntegration);
