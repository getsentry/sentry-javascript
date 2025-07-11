import type * as http from 'node:http';
import type { Span } from '@opentelemetry/api';
import type {
  ExpressInstrumentationConfig,
  ExpressLayerType,
  ExpressRequestInfo,
} from '@opentelemetry/instrumentation-express';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import type { IntegrationFn } from '@sentry/core';
import {
  captureException,
  defineIntegration,
  getDefaultIsolationScope,
  getIsolationScope,
  httpRequestToRequestData,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  spanToJSON,
} from '@sentry/core';
import { addOriginToSpan, ensureIsWrapped, generateInstrumentOnce } from '@sentry/node-core';
import { DEBUG_BUILD } from '../../debug-build';
import { ExpressInstrumentationV5 } from './express-v5/instrumentation';

const INTEGRATION_NAME = 'Express';
const INTEGRATION_NAME_V5 = 'Express-V5';

type IgnoreMatcher = string | RegExp | ((path: string) => boolean);

interface ExpressOptions {
  /**
   * Ignore specific layers based on their path.
   *
   * Accepts an array of matchers that can be:
   * - String: exact path match
   * - RegExp: pattern matching
   * - Function: custom logic that receives the path and returns boolean
   */
  ignoreLayers?: IgnoreMatcher[];
  /**
   * Ignore specific layers based on their type.
   *
   * Available layer types:
   * - 'router': Express router layers
   * - 'middleware': Express middleware layers
   * - 'request_handler': Express request handler layers
   *
   * @example
   * ```javascript
   * // Ignore only middleware layers
   * ignoreLayersType: ['middleware']
   *
   * // Ignore multiple layer types
   * ignoreLayersType: ['middleware', 'router']
   *
   * // Ignore all layer types (effectively disables tracing)
   * ignoreLayersType: ['middleware', 'router', 'request_handler']
   * ```
   */
  ignoreLayersType?: ('router' | 'middleware' | 'request_handler')[];
}

function requestHook(span: Span): void {
  addOriginToSpan(span, 'auto.http.otel.express');

  const attributes = spanToJSON(span).data;
  // this is one of: middleware, request_handler, router
  const type = attributes['express.type'];

  if (type) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, `${type}.express`);
  }

  // Also update the name, we don't need to "middleware - " prefix
  const name = attributes['express.name'];
  if (typeof name === 'string') {
    span.updateName(name);
  }
}

function spanNameHook(info: ExpressRequestInfo<unknown>, defaultName: string): string {
  if (getIsolationScope() === getDefaultIsolationScope()) {
    DEBUG_BUILD && logger.warn('Isolation scope is still default isolation scope - skipping setting transactionName');
    return defaultName;
  }
  if (info.layerType === 'request_handler') {
    // type cast b/c Otel unfortunately types info.request as any :(
    const req = info.request as { method?: string };
    const method = req.method ? req.method.toUpperCase() : 'GET';
    getIsolationScope().setTransactionName(`${method} ${info.route}`);
  }
  return defaultName;
}

function buildInstrumentationConfig(options: ExpressOptions): ExpressInstrumentationConfig {
  const config: ExpressInstrumentationConfig = {
    requestHook: (span: Span) => requestHook(span),
    spanNameHook: (info: ExpressRequestInfo<unknown>, defaultName: string) => spanNameHook(info, defaultName),
  };

  if (options.ignoreLayers) {
    config.ignoreLayers = options.ignoreLayers;
  }

  if (options.ignoreLayersType) {
    config.ignoreLayersType = options.ignoreLayersType as ExpressLayerType[];
  }

  return config;
}

export const instrumentExpress = generateInstrumentOnce(
  INTEGRATION_NAME,
  (options: ExpressOptions = {}) => new ExpressInstrumentation(buildInstrumentationConfig(options)),
);

export const instrumentExpressV5 = generateInstrumentOnce(
  INTEGRATION_NAME_V5,
  (options: ExpressOptions = {}) => new ExpressInstrumentationV5(buildInstrumentationConfig(options)),
);

const _expressIntegration = ((options: ExpressOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentExpress(options);
      instrumentExpressV5(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for [Express](https://expressjs.com/).
 *
 * If you also want to capture errors, you need to call `setupExpressErrorHandler(app)` after you set up your Express server.
 *
 * For more information, see the [express documentation](https://docs.sentry.io/platforms/javascript/guides/express/).
 *
 * @param {ExpressOptions} options Configuration options for the Express integration.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.expressIntegration()],
 * })
 * ```
 *
 * @example
 * ```javascript
 * // To ignore specific middleware layers by path
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [
 *     Sentry.expressIntegration({
 *       ignoreLayers: ['/health', /^\/internal/]
 *     })
 *   ],
 * })
 * ```
 *
 * @example
 * ```javascript
 * // To ignore specific middleware layers by type
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [
 *     Sentry.expressIntegration({
 *       ignoreLayersType: ['middleware']
 *     })
 *   ],
 * })
 * ```
 */
export const expressIntegration = defineIntegration(_expressIntegration);

interface MiddlewareError extends Error {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: {
    statusCode?: number | string;
  };
}

type ExpressMiddleware = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;

type ExpressErrorMiddleware = (
  error: MiddlewareError,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error: MiddlewareError) => void,
) => void;

interface ExpressHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(this: void, error: MiddlewareError): boolean;
}

/**
 * An Express-compatible error handler.
 */
export function expressErrorHandler(options?: ExpressHandlerOptions): ExpressErrorMiddleware {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    request: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    const normalizedRequest = httpRequestToRequestData(request);
    // Ensure we use the express-enhanced request here, instead of the plain HTTP one
    // When an error happens, the `expressRequestHandler` middleware does not run, so we set it here too
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });

    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      const eventId = captureException(error, { mechanism: { type: 'middleware', handled: false } });
      (res as { sentry?: string }).sentry = eventId;
    }

    next(error);
  };
}

function expressRequestHandler(): ExpressMiddleware {
  return function sentryRequestMiddleware(
    request: http.IncomingMessage,
    _res: http.ServerResponse,
    next: () => void,
  ): void {
    const normalizedRequest = httpRequestToRequestData(request);
    // Ensure we use the express-enhanced request here, instead of the plain HTTP one
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });

    next();
  };
}

/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instances
 * @param options {ExpressHandlerOptions} Configuration options for the handler
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const express = require("express");
 *
 * const app = express();
 *
 * // Add your routes, etc.
 *
 * // Add this after all routes,
 * // but before any and other error-handling middlewares are defined
 * Sentry.setupExpressErrorHandler(app);
 *
 * app.listen(3000);
 * ```
 */
export function setupExpressErrorHandler(
  app: { use: (middleware: ExpressMiddleware | ExpressErrorMiddleware) => unknown },
  options?: ExpressHandlerOptions,
): void {
  app.use(expressRequestHandler());
  app.use(expressErrorHandler(options));
  ensureIsWrapped(app.use, 'express');
}

function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}
