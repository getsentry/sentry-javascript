import type { Span } from '@sentry/core';
import {
  captureException,
  continueTrace,
  getActiveSpan,
  getIsolationScope,
  getRootSpan,
  getTraceData,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startInactiveSpan,
  startSpanManual,
  updateSpanName,
  winterCGRequestToRequestData,
  withIsolationScope,
} from '@sentry/core';
import type { Elysia, ErrorContext, TraceHandler, TraceListener } from 'elysia';

interface ElysiaHandlerOptions {
  shouldHandleError?: (context: ErrorContext) => boolean;
}

const ELYSIA_ORIGIN = 'auto.http.elysia';

/**
 * Map Elysia lifecycle phase names to Sentry span ops.
 */
const ELYSIA_LIFECYCLE_OP_MAP: Record<string, string> = {
  Request: 'middleware.elysia',
  Parse: 'middleware.elysia',
  Transform: 'middleware.elysia',
  BeforeHandle: 'middleware.elysia',
  Handle: 'request_handler.elysia',
  AfterHandle: 'middleware.elysia',
  MapResponse: 'middleware.elysia',
  AfterResponse: 'middleware.elysia',
  Error: 'middleware.elysia',
};

function isBun(): boolean {
  return typeof Bun !== 'undefined';
}

/**
 * Per-request storage for the root span reference.
 * .wrap() captures the root span and .trace() reads it.
 * This is necessary because Elysia's .trace() callbacks may run in a different
 * async context where getActiveSpan() returns undefined.
 */
const rootSpanForRequest = new WeakMap<Request, Span>();

const instrumentedApps = new WeakSet<Elysia>();

/**
 * Updates the root span and isolation scope with the parameterized route name.
 */
function updateRouteTransactionName(request: Request, method: string, route: string): void {
  const transactionName = `${method} ${route}`;

  // Try the stored root span first (reliable across async contexts),
  // then fall back to getActiveSpan() for cases where async context is preserved.
  const rootSpan = rootSpanForRequest.get(request);
  if (rootSpan) {
    updateSpanName(rootSpan, transactionName);
    rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  } else {
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const root = getRootSpan(activeSpan);
      updateSpanName(root, transactionName);
      root.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
    }
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
 * Instruments a single Elysia lifecycle phase by creating a Sentry span for it,
 * and child spans for each individual handler within the phase.
 *
 * @param rootSpan - The root server span to parent lifecycle spans under.
 *   Must be passed explicitly because Elysia's .trace() listener callbacks run
 *   in a different async context where getActiveSpan() returns undefined.
 */
function instrumentLifecyclePhase(phaseName: string, listener: TraceListener, rootSpan: Span | undefined): void {
  const op = ELYSIA_LIFECYCLE_OP_MAP[phaseName];
  if (!op) {
    return;
  }

  void listener(process => {
    const phaseSpan = startInactiveSpan({
      name: phaseName,
      parentSpan: rootSpan,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ELYSIA_ORIGIN,
      },
    });

    // Create child spans for individual handlers within this phase.
    // Named functions get their name, arrow functions get 'anonymous'.
    if (process.total > 0) {
      void process.onEvent(child => {
        const handlerName = child.name || 'anonymous';
        const childSpan = startInactiveSpan({
          name: handlerName,
          parentSpan: phaseSpan,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: op,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ELYSIA_ORIGIN,
          },
        });

        void child.onStop(() => {
          childSpan.end();
        });
      });
    }

    void process.onStop(() => {
      phaseSpan.end();
    });
  });
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

  // Use .wrap() to capture or create the root span for each request.
  // This is necessary because Elysia's .trace() callbacks run in a different
  // async context where getActiveSpan() returns undefined. By storing the root
  // span in a WeakMap keyed by the Request object, we can retrieve it in .trace().
  // HigherOrderFunction type is not exported from elysia's main entry point,
  // so we type the callback parameters directly.
  app.wrap((fn: (...args: unknown[]) => unknown, request: Request) => {
    if (isBun()) {
      // On Bun there is no HTTP instrumentation, so we create a root span ourselves.
      // Scope setup must happen inside the returned function so that it's active
      // when Elysia calls the handler (not during .wrap() registration).
      return (...args: unknown[]) => {
        return withIsolationScope(() => {
          return continueTrace(
            {
              sentryTrace: request.headers.get('sentry-trace') || '',
              baggage: request.headers.get('baggage'),
            },
            () => {
              return startSpanManual(
                {
                  op: 'http.server',
                  name: `${request.method} ${new URL(request.url).pathname}`,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ELYSIA_ORIGIN,
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  },
                },
                rootSpan => {
                  rootSpanForRequest.set(request, rootSpan);
                  try {
                    const result = fn(...args);
                    if (result instanceof Promise) {
                      return result.then(
                        res => {
                          rootSpanForRequest.delete(request);
                          rootSpan.end();
                          return res;
                        },
                        err => {
                          rootSpanForRequest.delete(request);
                          rootSpan.end();
                          throw err;
                        },
                      );
                    }
                    rootSpanForRequest.delete(request);
                    rootSpan.end();
                    return result;
                  } catch (err) {
                    rootSpanForRequest.delete(request);
                    rootSpan.end();
                    throw err;
                  }
                },
              );
            },
          );
        });
      };
    }

    // On Node.js, the HTTP instrumentation already creates a root span.
    // We just capture its reference so .trace() can use it.
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      rootSpanForRequest.set(request, getRootSpan(activeSpan));
    }
    return fn;
  });

  // Use .trace() ONLY for span creation. The trace API is observational —
  // callbacks fire after phases complete, so they can't reliably mutate
  // response headers or capture errors. All SDK logic stays in real hooks.
  const traceHandler: TraceHandler = lifecycle => {
    const rootSpan = rootSpanForRequest.get(lifecycle.context.request);

    const phases: [string, TraceListener][] = [
      ['Request', lifecycle.onRequest],
      ['Parse', lifecycle.onParse],
      ['Transform', lifecycle.onTransform],
      ['BeforeHandle', lifecycle.onBeforeHandle],
      ['Handle', lifecycle.onHandle],
      ['AfterHandle', lifecycle.onAfterHandle],
      ['MapResponse', lifecycle.onMapResponse],
      ['AfterResponse', lifecycle.onAfterResponse],
      ['Error', lifecycle.onError],
    ];

    for (const [phaseName, listener] of phases) {
      if (listener) {
        instrumentLifecyclePhase(phaseName, listener, rootSpan);
      }
    }
  };

  app.trace({ as: 'global' }, traceHandler);

  // SDK logic uses real lifecycle hooks — these show up as handler spans
  // in the trace (named sentryOnRequest etc.), but that's the correct
  // tradeoff: the trace API can't reliably mutate state or capture errors.

  app.onRequest(function sentryOnRequest(context) {
    getIsolationScope().setSDKProcessingMetadata({
      normalizedRequest: winterCGRequestToRequestData(context.request),
    });
  });

  app.onAfterHandle({ as: 'global' }, function sentryOnAfterHandle(context) {
    if (context.route) {
      updateRouteTransactionName(context.request, context.request.method, context.route);
    }

    const traceData = getTraceData();
    if (traceData['sentry-trace']) {
      context.set.headers['sentry-trace'] = traceData['sentry-trace'];
    }
    if (traceData.baggage) {
      context.set.headers['baggage'] = traceData.baggage;
    }
  });

  app.onError({ as: 'global' }, function sentryOnError(context) {
    if (context.route) {
      updateRouteTransactionName(context.request, context.request.method, context.route);
    }

    // Set error status on root span
    const rootSpan = rootSpanForRequest.get(context.request);
    if (rootSpan) {
      const statusCode = parseInt(String(context.set.status), 10);
      setHttpStatus(rootSpan, Number.isNaN(statusCode) ? 500 : statusCode);
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
