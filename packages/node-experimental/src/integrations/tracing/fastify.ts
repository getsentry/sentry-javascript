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

// We inline the types we care about here
interface Fastify {
  register: (plugin: unknown) => void;
  addHook: (hook: string, handler: (request: unknown, reply: unknown, error: Error) => void) => void;
}

/**
 * Setup an error handler for Fastify.
 */
export function setupFastifyErrorHandler(fastify: Fastify): void {
  const plugin = Object.assign(
    function (fastify: Fastify, options: unknown, done: () => void): void {
      fastify.addHook('onError', async (_request, _reply, error) => {
        captureException(error);
      });

      done();
    },
    {
      [Symbol.for('skip-override')]: true,
      [Symbol.for('fastify.display-name')]: 'sentry-fastify-error-handler',
    },
  );

  fastify.register(plugin);
}
