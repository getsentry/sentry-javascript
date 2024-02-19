import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const _fastifyIntegration = (() => {
  return {
    name: 'Fastify',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new FastifyInstrumentation({
            requestHook(span) {
              addOriginToSpan(span, 'auto.http.otel.fastify');
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
 * Capture tracing data for fastify.
 */
export const fastifyIntegration = defineIntegration(_fastifyIntegration);
