import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getClient,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';
import { ensureIsWrapped } from '../../utils/ensureIsWrapped';

// We inline the types we care about here
interface Fastify {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: (plugin: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addHook: (hook: string, handler: (request: any, reply: any, error: Error) => void) => void;
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

const INTEGRATION_NAME = 'Fastify';

export const instrumentFastify = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new FastifyInstrumentation({
      requestHook(span) {
        addFastifySpanAttributes(span);
      },
    }),
);

const _fastifyIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentFastify();
    },
  };
}) satisfies IntegrationFn;

/**
 * Express integration
 *
 * Capture tracing data for fastify.
 */
export const fastifyIntegration = defineIntegration(_fastifyIntegration);

interface FastifyHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shouldHandleError?(this: void, request: any, reply: any, error: Error): boolean;
}

/**
 * Setup an error handler for Fastify.
 */
export function setupFastifyErrorHandler(fastify: Fastify, options?: FastifyHandlerOptions): void {
  const plugin = Object.assign(
    function (fastify: Fastify, _options: unknown, done: () => void): void {
      const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

      fastify.addHook('onError', async (request, reply, error) => {
        if (shouldHandleError(request, reply, error)) {
          captureException(error, { mechanism: { type: 'middleware', handled: false } });
        }
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

  // Sadly, middleware spans do not go through `requestHook`, so we handle those here
  // We register this hook in this method, because if we register it in the integration `setup`,
  // it would always run even for users that are not even using fastify
  const client = getClient();
  if (client) {
    client.on('spanStart', span => {
      addFastifySpanAttributes(span);
    });
  }

  ensureIsWrapped(fastify.addHook, 'fastify');
}

function addFastifySpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data || {};

  // this is one of: middleware, request_handler
  const type = attributes['fastify.type'];

  // If this is already set, or we have no fastify span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.fastify',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.fastify`,
  });

  // Also update the name, we don't need to "middleware - " prefix
  const name = attributes['fastify.name'] || attributes['plugin.name'] || attributes['hook.name'];
  if (typeof name === 'string') {
    // Also remove `fastify -> ` prefix
    span.updateName(name.replace(/^fastify -> /, ''));
  }
}

/** Returns true if response code is internal server error */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultShouldHandleError(_request: any, reply: any, _error: Error): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return reply.statusCode >= 500;
}
