import type * as http from 'node:http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, defineIntegration, getDefaultIsolationScope, spanToJSON } from '@sentry/core';
import { captureException, getClient, getIsolationScope } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../../debug-build';
import { generateInstrumentOnce } from '../../otel/instrument';
import type { NodeClient } from '../../sdk/client';
import { addOriginToSpan } from '../../utils/addOriginToSpan';
import { ensureIsWrapped } from '../../utils/ensureIsWrapped';

const INTEGRATION_NAME = 'Express';

export const instrumentExpress = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new ExpressInstrumentation({
      requestHook(span) {
        addOriginToSpan(span, 'auto.http.otel.express');

        const attributes = spanToJSON(span).data || {};
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
      },
      spanNameHook(info, defaultName) {
        if (getIsolationScope() === getDefaultIsolationScope()) {
          DEBUG_BUILD &&
            logger.warn('Isolation scope is still default isolation scope - skipping setting transactionName');
          return defaultName;
        }
        if (info.layerType === 'request_handler') {
          // type cast b/c Otel unfortunately types info.request as any :(
          const req = info.request as { method?: string };
          const method = req.method ? req.method.toUpperCase() : 'GET';
          getIsolationScope().setTransactionName(`${method} ${info.route}`);
        }
        return defaultName;
      },
    }),
);

const _expressIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentExpress();
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
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.expressIntegration()],
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

type ExpressMiddleware = (
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
export function expressErrorHandler(options?: ExpressHandlerOptions): ExpressMiddleware {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      const client = getClient<NodeClient>();
      if (client && client.getOptions().autoSessionTracking) {
        // Check if the `SessionFlusher` is instantiated on the client to go into this branch that marks the
        // `requestSession.status` as `Crashed`, and this check is necessary because the `SessionFlusher` is only
        // instantiated when the the`requestHandler` middleware is initialised, which indicates that we should be
        // running in SessionAggregates mode
        const isSessionAggregatesMode = client['_sessionFlusher'] !== undefined;
        if (isSessionAggregatesMode) {
          const requestSession = getIsolationScope().getRequestSession();
          // If an error bubbles to the `errorHandler`, then this is an unhandled error, and should be reported as a
          // Crashed session. The `_requestSession.status` is checked to ensure that this error is happening within
          // the bounds of a request, and if so the status is updated
          if (requestSession && requestSession.status !== undefined) {
            requestSession.status = 'crashed';
          }
        }
      }

      const eventId = captureException(error, { mechanism: { type: 'middleware', handled: false } });
      (res as { sentry?: string }).sentry = eventId;
      next(error);

      return;
    }

    next(error);
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
  app: { use: (middleware: ExpressMiddleware) => unknown },
  options?: ExpressHandlerOptions,
): void {
  app.use(expressErrorHandler(options));
  ensureIsWrapped(app.use, 'express');
}

function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || (error.output && error.output.statusCode);
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}
