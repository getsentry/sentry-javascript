import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { captureException, defineIntegration, getIsolationScope } from '@sentry/core';
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
 * Minimal request type containing properties around route information.
 * Works for Fastify 3, 4 and presumably 5.
 */
interface FastifyRequestRouteInfo {
  // since fastify@4.10.0
  routeOptions?: {
    url?: string;
    method?: string;
  };
  routerPath?: string;
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

      // registering `onRequest` hook here instead of using Otel `onRequest` callback b/c `onRequest` hook
      // is ironically called in the fastify `preHandler` hook which is called later in the lifecycle:
      // https://fastify.dev/docs/latest/Reference/Lifecycle/
      fastify.addHook('onRequest', async (request, _reply) => {
        const reqWithRouteInfo = request as FastifyRequestRouteInfo;

        // Taken from Otel Fastify instrumentation:
        // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-fastify/src/instrumentation.ts#L94-L96
        const routeName = reqWithRouteInfo.routeOptions?.url || reqWithRouteInfo.routerPath;
        const method = reqWithRouteInfo.routeOptions?.method || 'GET';

        getIsolationScope().setTransactionName(`${method} ${routeName}`);
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
