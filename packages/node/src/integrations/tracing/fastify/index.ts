import FastifyOtelInstrumentation from '@fastify/otel';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getClient,
  getIsolationScope,
  logger,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { FastifyInstrumentationV3 } from './v3/instrumentation';
import * as diagnosticsChannel from 'node:diagnostics_channel';
import { DEBUG_BUILD } from '../../../debug-build';
import type { FastifyInstance, FastifyReply, FastifyRequest } from './types';

interface FastifyHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   *
   * @param error Captured Fastify error
   * @param request Fastify request (or any object containing at least method, routeOptions.url, and routerPath)
   * @param reply Fastify reply (or any object containing at least statusCode)
   *
   * @example
   *
   * ```javascript
   * setupFastifyErrorHandler(app, {
   *   shouldHandleError(_error, _request, reply) {
   *     return reply.statusCode >= 400;
   *   },
   * });
   * ```
   *
   * If using TypeScript, you can cast the request and reply to get full type safety.
   *
   * ```typescript
   * import type { FastifyRequest, FastifyReply } from 'fastify';
   *
   * setupFastifyErrorHandler(app, {
   *   shouldHandleError(error, minimalRequest, minimalReply) {
   *     const request = minimalRequest as FastifyRequest;
   *     const reply = minimalReply as FastifyReply;
   *     return reply.statusCode >= 500;
   *   },
   * });
   * ```
   */
  shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean;
}

const INTEGRATION_NAME = 'Fastify';
const INTEGRATION_NAME_V3 = 'Fastify-V3';

export const instrumentFastifyV3 = generateInstrumentOnce(
  INTEGRATION_NAME_V3,
  () =>
    new FastifyInstrumentationV3({
      requestHook(span) {
        addFastifySpanAttributes(span);
      },
    }),
);

export const instrumentFastify = generateInstrumentOnce(INTEGRATION_NAME, () => {
  // FastifyOtelInstrumentation does not have a `requestHook`
  // so we can't use `addFastifySpanAttributes` here for now
  const fastifyOtelInstrumentationInstance = new FastifyOtelInstrumentation();
  const plugin = fastifyOtelInstrumentationInstance.plugin();

  diagnosticsChannel.subscribe('fastify.initialization', message => {
    const fastifyInstance = (message as { fastify?: FastifyInstance }).fastify;

    fastifyInstance?.register(plugin).after(err => {
      if (err) {
        DEBUG_BUILD && logger.error('Failed to setup Fastify instrumentation', err);
      }
    });
  });

  return fastifyOtelInstrumentationInstance;
});

const _fastifyIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentFastifyV3();
      instrumentFastify();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Fastify](https://fastify.dev/).
 *
 * If you also want to capture errors, you need to call `setupFastifyErrorHandler(app)` after you set up your Fastify server.
 *
 * For more information, see the [fastify documentation](https://docs.sentry.io/platforms/javascript/guides/fastify/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.fastifyIntegration()],
 * })
 * ```
 */
export const fastifyIntegration = defineIntegration(_fastifyIntegration);

/**
 * Default function to determine if an error should be sent to Sentry
 *
 * 3xx and 4xx errors are not sent by default.
 */
function defaultShouldHandleError(_error: Error, _request: FastifyRequest, reply: FastifyReply): boolean {
  const statusCode = reply.statusCode;
  // 3xx and 4xx errors are not sent by default.
  return statusCode >= 500 || statusCode <= 299;
}

/**
 * Add an Fastify error handler to capture errors to Sentry.
 *
 * @param fastify The Fastify instance to which to add the error handler
 * @param options Configuration options for the handler
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const Fastify = require("fastify");
 *
 * const app = Fastify();
 *
 * Sentry.setupFastifyErrorHandler(app);
 *
 * // Add your routes, etc.
 *
 * app.listen({ port: 3000 });
 * ```
 */
export function setupFastifyErrorHandler(fastify: FastifyInstance, options?: Partial<FastifyHandlerOptions>): void {
  const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

  const plugin = Object.assign(
    function (fastify: FastifyInstance, _options: unknown, done: () => void): void {
      fastify.addHook('onError', async (request, reply, error) => {
        if (shouldHandleError(error, request, reply)) {
          captureException(error);
        }
      });

      // registering `onRequest` hook here instead of using Otel `onRequest` callback b/c `onRequest` hook
      // is ironically called in the fastify `preHandler` hook which is called later in the lifecycle:
      // https://fastify.dev/docs/latest/Reference/Lifecycle/
      fastify.addHook('onRequest', async (request, _reply) => {
        // Taken from Otel Fastify instrumentation:
        // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/node/opentelemetry-instrumentation-fastify/src/instrumentation.ts#L94-L96
        const routeName = request.routeOptions?.url || request.routerPath;
        const method = request.method || 'GET';

        getIsolationScope().setTransactionName(`${method} ${routeName}`);
      });

      done();
    },
    {
      [Symbol.for('skip-override')]: true,
      [Symbol.for('fastify.display-name')]: 'sentry-fastify-error-handler',
    },
  );

  // Sadly, middleware spans do not go through `requestHook`, so we handle those here
  // We register this hook in this method, because if we register it in the integration `setup`,
  // it would always run even for users that are not even using fastify
  const client = getClient();
  if (client) {
    client.on('spanStart', span => {
      addFastifySpanAttributes(span);
    });
  }

  fastify.register(plugin);
}

function addFastifySpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data;

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
    // Try removing `fastify -> ` and `@fastify/otel -> ` prefixes
    // This is a bit of a hack, and not always working for all spans
    // But it's the best we can do without a proper API
    const updatedName = name.replace(/^fastify -> /, '').replace(/^@fastify\/otel -> /, '');

    span.updateName(updatedName);
  }
}
