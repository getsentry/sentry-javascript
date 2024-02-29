import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _mongooseIntegration = (() => {
  return {
    name: 'Mongoose',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new MongooseInstrumentation({
            responseHook(span) {
              addOriginToSpan(span, 'auto.db.otel.mongoose');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Mongoose integration
 *
 * Capture tracing data for Mongoose.
 */
export const mongooseIntegration = defineIntegration(_mongooseIntegration);
