import { opentelemetry } from '@elysiajs/opentelemetry';
import {
  captureException,
  getActiveSpan,
  getClient,
  getIsolationScope,
  getRootSpan,
  getTraceData,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  updateSpanName,
  winterCGRequestToRequestData,
} from '@sentry/core';
import type { Elysia, ErrorContext } from 'elysia';
import { setupClientHooks } from './clientHooks';

interface ElysiaHandlerOptions {
  shouldHandleError?: (context: ErrorContext) => boolean;
}

function isBun(): boolean {
  return typeof Bun !== 'undefined';
}

let isClientHooksSetup = false;
const instrumentedApps = new WeakSet<Elysia>();

/**
 * Updates the root span and isolation scope with the parameterized route name.
 * Only needed on Node.js where the root span comes from HTTP instrumentation.
 */
function updateRouteTransactionName(method: string, route: string): void {
  const transactionName = `${method} ${route}`;

  const activeSpan = getActiveSpan();
  if (activeSpan) {
    const rootSpan = getRootSpan(activeSpan);
    updateSpanName(rootSpan, transactionName);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  }

  getIsolationScope().setTransactionName(transactionName);
}

function defaultShouldHandleError(context: ErrorContext): boolean {
  const status = context.set.status;
  if (status === undefined) {
    return true;
  }
  const statusCode = parseInt(String(status), 10);
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
export function withElysia<T extends Elysia>(app: T, options: ElysiaHandlerOptions = {}): T {
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

  // Propagate trace data to all response headers and update transaction name
  app.onAfterHandle({ as: 'global' }, context => {
    // On Node.js, the root span is created by the HTTP instrumentation and only has the raw URL.
    // The Elysia OTel plugin creates a child span with route info, but we need to propagate it up.
    // On Bun, the Elysia OTel plugin already handles the root span correctly.
    if (!isBun() && context.route) {
      updateRouteTransactionName(context.request.method, context.route);
    }

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
      updateRouteTransactionName(context.request.method, context.route);
    }

    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;
    if (shouldHandleError(context)) {
      captureException(context.error, {
        mechanism: {
          type: 'auto.http.elysia.on_error',
          handled: false,
        },
      });
    }
  });

  return app;
}
