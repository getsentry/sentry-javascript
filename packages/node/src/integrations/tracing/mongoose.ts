import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Mongoose';

export const instrumentMongoose = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MongooseInstrumentation({
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mongoose');
      },
    }),
);

const _mongooseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMongoose();
    },
  };
}) satisfies IntegrationFn;

/**
 * Mongoose integration
 *
 * Capture tracing data for Mongoose.
 */
export const mongooseIntegration = defineIntegration(_mongooseIntegration);
