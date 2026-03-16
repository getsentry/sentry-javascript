import { opentelemetry } from '@elysiajs/opentelemetry';
import {
  captureException,
  getClient,
  getIsolationScope,
  getTraceData,
  winterCGRequestToRequestData,
} from '@sentry/core';
import type { Elysia, ErrorContext } from 'elysia';
import { setupClientHooks } from './clientHooks';

interface ElysiaHandlerOptions {
  shouldHandleError: (context: ErrorContext) => boolean;
}

let isClientHooksSetup = false;
const instrumentedApps = new WeakSet<Elysia>();

function defaultShouldHandleError(context: ErrorContext): boolean {
  const status = context.set.status;
  if (status === undefined) {
    return true;
  }
  const statusCode = typeof status === 'string' ? parseInt(status, 10) : status;
  if (Number.isNaN(statusCode)) {
    return true;
  }
  // Capture server errors (5xx) and unusual status codes (<= 299 in an error handler).
  // 3xx and 4xx are not captured by default (client errors / redirects).
  return statusCode >= 500 || statusCode <= 299;
}

/**
 * Integrate Sentry with an Elysia app for error handling, request context,
 * and tracing. Returns the app instance for chaining.
 *
 * Should be called at the **start** of the chain before defining routes.
 *
 * @param app The Elysia instance
 * @param options Configuration options
 * @returns The same Elysia instance for chaining
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/elysia';
 * import { Elysia } from 'elysia';
 *
 * Sentry.withElysia(new Elysia())
 *   .get('/', () => 'Hello World')
 *   .listen(3000);
 * ```
 */
export function withElysia<T extends Elysia>(app: T, options?: Partial<ElysiaHandlerOptions>): T {
  if (instrumentedApps.has(app)) {
    return app;
  }
  instrumentedApps.add(app);

  // Register the opentelemetry plugin
  // https://elysiajs.com/plugins/opentelemetry
  app.use(opentelemetry());

  if (!isClientHooksSetup) {
    const client = getClient();
    if (client) {
      isClientHooksSetup = true;
      setupClientHooks(client);
    }
  }

  // Set SDK processing metadata for all requests
  app.onRequest(context => {
    getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: winterCGRequestToRequestData(context.request),
    });
  });

  // Propagate trace data to all response headers
  app.onAfterHandle({ as: 'global' }, context => {
    const traceData = getTraceData();
    if (traceData['sentry-trace']) {
      context.set.headers['sentry-trace'] = traceData['sentry-trace'];
    }
    if (traceData.baggage) {
      context.set.headers['baggage'] = traceData.baggage;
    }
  });

  // Register the error handler for all routes
  app.onError({ as: 'global' }, context => {
    if (context.route) {
      getIsolationScope().setTransactionName(`${context.request.method} ${context.route}`);
    }

    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;
    if (shouldHandleError(context)) {
      captureException(context.error, {
        mechanism: {
          type: 'elysia',
          handled: false,
        },
      });
    }
  });

  return app;
}
