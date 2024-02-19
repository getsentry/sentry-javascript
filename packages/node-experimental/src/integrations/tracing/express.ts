import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _expressIntegration = (() => {
  return {
    name: 'Express',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new ExpressInstrumentation({
            requestHook(span) {
              addOriginToSpan(span, 'auto.http.otel.express');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Express integration
 *
 * Capture tracing data for express.
 */
export const expressIntegration = defineIntegration(_expressIntegration);
