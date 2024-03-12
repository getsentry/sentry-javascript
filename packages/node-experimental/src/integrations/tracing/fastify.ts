import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { captureException, defineIntegration } from '@sentry/core';
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

/**
 * Setup an error handler for Fastify.
 */
export function setupFastifyErrorHandler(fastify: {
  addHook: (hook: string, handler: (request: unknown, reply: unknown, error: Error) => void) => void;
}): void {
  fastify.addHook('onError', async (_request, _reply, error) => {
    captureException(error);
  });
}
