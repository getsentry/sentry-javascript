import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Instrumentation, InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  captureException,
  defineIntegration,
  getClient,
  getIsolationScope,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../../debug-build';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { FastifyOtelInstrumentation } from './fastify-otel/index';
import type { FastifyInstance, FastifyReply, FastifyRequest } from './types';
import { FastifyInstrumentationV3 } from './v3/instrumentation';

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

export const instrumentFastifyV3 = generateInstrumentOnce(INTEGRATION_NAME_V3, () => new FastifyInstrumentationV3());

function handleFastifyError(
  this: {
    diagnosticsChannelExists?: boolean;
  },
  error: Error,
  request: FastifyRequest & { opentelemetry?: () => { span?: Span } },
  reply: FastifyReply,
  shouldHandleError: (error: Error, request: FastifyRequest, reply: FastifyReply) => boolean,
  handlerOrigin: 'diagnostics-channel' | 'onError-hook',
): void {
  // Diagnostics channel runs before the onError hook, so we can use it to check if the handler was already registered
  if (handlerOrigin === 'diagnostics-channel') {
    this.diagnosticsChannelExists = true;
  }

  if (this.diagnosticsChannelExists && handlerOrigin === 'onError-hook') {
    DEBUG_BUILD &&
      logger.warn(
        'Fastify error handler was already registered via diagnostics channel.',
        'You can safely remove `setupFastifyErrorHandler` call.',
      );

    // If the diagnostics channel already exists, we don't need to handle the error again
    return;
  }

  if (shouldHandleError(error, request, reply)) {
    captureException(error);
  }
}

export const instrumentFastify = generateInstrumentOnce(INTEGRATION_NAME, () => {
  const fastifyOtelInstrumentationInstance = new FastifyOtelInstrumentation();
  const plugin = fastifyOtelInstrumentationInstance.plugin();
  const options = fastifyOtelInstrumentationInstance.getConfig();
  const shouldHandleError = (options as FastifyHandlerOptions)?.shouldHandleError || defaultShouldHandleError;

  // This message handler works for Fastify versions 3, 4 and 5
  diagnosticsChannel.subscribe('fastify.initialization', message => {
    const fastifyInstance = (message as { fastify?: FastifyInstance }).fastify;

    fastifyInstance?.register(plugin).after(err => {
      if (err) {
        DEBUG_BUILD && logger.error('Failed to setup Fastify instrumentation', err);
      } else {
        instrumentClient();

        if (fastifyInstance) {
          instrumentOnRequest(fastifyInstance);
        }
      }
    });
  });

  // This diagnostics channel only works on Fastify version 5
  // For versions 3 and 4, we use `setupFastifyErrorHandler` instead
  diagnosticsChannel.subscribe('tracing:fastify.request.handler:error', message => {
    const { error, request, reply } = message as {
      error: Error;
      request: FastifyRequest & { opentelemetry?: () => { span?: Span } };
      reply: FastifyReply;
    };

    handleFastifyError.call(handleFastifyError, error, request, reply, shouldHandleError, 'diagnostics-channel');
  });

  // Returning this as unknown not to deal with the internal types of the FastifyOtelInstrumentation
  return fastifyOtelInstrumentationInstance as Instrumentation<InstrumentationConfig & FastifyHandlerOptions>;
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
        handleFastifyError.call(handleFastifyError, error, request, reply, shouldHandleError, 'onError-hook');
      });
      done();
    },
    {
      [Symbol.for('skip-override')]: true,
      [Symbol.for('fastify.display-name')]: 'sentry-fastify-error-handler',
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  fastify.register(plugin);
}

function addFastifySpanAttributes(span: Span): void {
  const spanJSON = spanToJSON(span);
  const spanName = spanJSON.description;
  const attributes = spanJSON.data;

  const type = attributes['fastify.type'];

  const isHook = type === 'hook';
  const isHandler = type === spanName?.startsWith('handler -');
  // In @fastify/otel `request-handler` is separated by dash, not underscore
  const isRequestHandler = spanName === 'request' || type === 'request-handler';

  // If this is already set, or we have no fastify span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || (!isHandler && !isRequestHandler && !isHook)) {
    return;
  }

  const opPrefix = isHook ? 'hook' : isHandler ? 'middleware' : isRequestHandler ? 'request-handler' : '<unknown>';

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.fastify',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${opPrefix}.fastify`,
  });

  const attrName = attributes['fastify.name'] || attributes['plugin.name'] || attributes['hook.name'];
  if (typeof attrName === 'string') {
    // Try removing `fastify -> ` and `@fastify/otel -> ` prefixes
    // This is a bit of a hack, and not always working for all spans
    // But it's the best we can do without a proper API
    const updatedName = attrName.replace(/^fastify -> /, '').replace(/^@fastify\/otel -> /, '');

    span.updateName(updatedName);
  }
}

function instrumentClient(): void {
  const client = getClient();
  if (client) {
    client.on('spanStart', (span: Span) => {
      addFastifySpanAttributes(span);
    });
  }
}

function instrumentOnRequest(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request: FastifyRequest & { opentelemetry?: () => { span?: Span } }, _reply) => {
    if (request.opentelemetry) {
      const { span } = request.opentelemetry();

      if (span) {
        addFastifySpanAttributes(span);
      }
    }

    const routeName = request.routeOptions?.url;
    const method = request.method || 'GET';

    getIsolationScope().setTransactionName(`${method} ${routeName}`);
  });
}
