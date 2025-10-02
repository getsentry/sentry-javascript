import { ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type { IntegrationFn, Span } from '@sentry/core';
import {
  captureException,
  debug,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  httpRequestToRequestData,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';
import { ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../../debug-build';
import { AttributeNames } from './constants';
import { HonoInstrumentation } from './instrumentation';
import type { Context, MiddlewareHandler, MiddlewareHandlerInterface, Next } from './types';

const INTEGRATION_NAME = 'Hono';

function addHonoSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data;
  const type = attributes[AttributeNames.HONO_TYPE];
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.hono',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.hono`,
  });

  const name = attributes[AttributeNames.HONO_NAME];
  if (typeof name === 'string') {
    span.updateName(name);
  }

  if (getIsolationScope() === getDefaultIsolationScope()) {
    DEBUG_BUILD && debug.warn('Isolation scope is default isolation scope - skipping setting transactionName');
    return;
  }

  const route = attributes[ATTR_HTTP_ROUTE];
  const method = attributes[ATTR_HTTP_REQUEST_METHOD];
  if (typeof route === 'string' && typeof method === 'string') {
    getIsolationScope().setTransactionName(`${method} ${route}`);
  }
}

export const instrumentHono = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new HonoInstrumentation({
      responseHook: span => {
        addHonoSpanAttributes(span);
      },
    }),
);

const _honoIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentHono();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Hono](https://hono.dev/).
 *
 * If you also want to capture errors, you need to call `setupHonoErrorHandler(app)` after you set up your Hono server.
 *
 * For more information, see the [hono documentation](https://docs.sentry.io/platforms/javascript/guides/hono/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.honoIntegration()],
 * })
 * ```
 */
export const honoIntegration = defineIntegration(_honoIntegration);

interface HonoHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured Hono error
   */
  shouldHandleError: (context: Context) => boolean;
}

function honoRequestHandler(): MiddlewareHandler {
  return async function sentryRequestMiddleware(context: Context, next: Next): Promise<void> {
    const normalizedRequest = httpRequestToRequestData(context.req);
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });
    await next();
  };
}

function defaultShouldHandleError(context: Context): boolean {
  const statusCode = context.res.status;
  return statusCode >= 500;
}

function honoErrorHandler(options?: Partial<HonoHandlerOptions>): MiddlewareHandler {
  return async function sentryErrorMiddleware(context: Context, next: Next): Promise<void> {
    await next();

    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;
    if (shouldHandleError(context)) {
      (context.res as { sentry?: string }).sentry = captureException(context.error, {
        mechanism: {
          type: 'auto.middleware.hono',
          handled: false,
        },
      });
    }
  };
}

/**
 * Add a Hono error handler to capture errors to Sentry.
 *
 * @param app The Hono instances
 * @param options Configuration options for the handler
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const { Hono } = require("hono");
 *
 * const app = new Hono();
 *
 * Sentry.setupHonoErrorHandler(app);
 *
 * // Add your routes, etc.
 * ```
 */
export function setupHonoErrorHandler(
  app: { use: MiddlewareHandlerInterface },
  options?: Partial<HonoHandlerOptions>,
): void {
  app.use(honoRequestHandler());
  app.use(honoErrorHandler(options));
  ensureIsWrapped(app.use, 'hono');
}
