import {
  CODE_FUNCTION_NAME,
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_OP,
  URL_FULL,
  URL_PATH,
} from '@sentry/conventions/attributes';
import { WEB_SERVER_FUNCTION_SPAN_OP, WEB_SERVER_MIDDLEWARE_SPAN_OP } from '@sentry/conventions/op';
import {
  debug,
  flushIfServerless,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  startSpan,
  updateSpanName,
  filterCollectedUrl,
} from '@sentry/core';
import type { ServerInstrumentation } from 'react-router';
import { DEBUG_BUILD } from '../common/debug-build';
import { captureInstrumentationError, getPathFromRequest, getPattern, normalizeRoutePath } from '../common/utils';
import { getMiddlewareName } from './serverBuild';
import { markInstrumentationApiUsed } from './serverGlobals';

// Per-request middleware counters, keyed by the request's root span (the one transaction all of a
// request's middlewares run under). The root span is the same instance across those middleware hooks
// whether or not a Sentry OpenTelemetry tracer provider is set up, unlike the OTel context the counter
// used to live on (which does not propagate without a provider).
const middlewareCountersByRootSpan = new WeakMap<object, Record<string, number>>();

// Re-export for backward compatibility and external use
export { isInstrumentationApiUsed } from './serverGlobals';

/**
 * Options for creating Sentry server instrumentation.
 */
export interface CreateSentryServerInstrumentationOptions {
  /**
   * Whether to capture errors from loaders/actions automatically.
   * @default true
   */
  captureErrors?: boolean;
}

/**
 * Creates a Sentry server instrumentation for React Router's instrumentation API.
 */
export function createSentryServerInstrumentation(
  options: CreateSentryServerInstrumentationOptions = {},
): ServerInstrumentation {
  const { captureErrors = true } = options;

  DEBUG_BUILD && debug.log('React Router server instrumentation created.');

  return {
    handler(handler) {
      // Mark the instrumentation API active only when React Router actually invokes this
      markInstrumentationApiUsed();
      handler.instrument({
        async request(handleRequest, info) {
          const pathname = getPathFromRequest(info.request);
          const activeSpan = getActiveSpan();
          const existingRootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

          if (existingRootSpan) {
            updateSpanName(existingRootSpan, `${info.request.method} ${pathname}`);
            existingRootSpan.setAttributes({
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.instrumentation_api',
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [URL_FULL]: filterCollectedUrl(info.request.url),
              [URL_PATH]: pathname,
            });

            try {
              const result = await handleRequest();
              if (result.status === 'error' && result.error instanceof Error) {
                existingRootSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.request_handler', {
                  'http.method': info.request.method,
                  [URL_FULL]: pathname,
                });
              }
            } finally {
              await flushIfServerless();
            }
          } else {
            await startSpan(
              {
                name: `${info.request.method} ${pathname}`,
                forceTransaction: true,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.instrumentation_api',
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  [HTTP_REQUEST_METHOD]: info.request.method,
                  [URL_PATH]: pathname,
                  [URL_FULL]: filterCollectedUrl(info.request.url),
                },
              },
              async span => {
                try {
                  const result = await handleRequest();
                  if (result.status === 'error' && result.error instanceof Error) {
                    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                    captureInstrumentationError(result, captureErrors, 'react_router.request_handler', {
                      'http.method': info.request.method,
                      [URL_FULL]: pathname,
                    });
                  }
                } finally {
                  await flushIfServerless();
                }
              },
            );
          }
        },
      });
    },

    route(route) {
      // Also mark active here, in case route registration runs (mirrors the handler callback above).
      markInstrumentationApiUsed();
      const routeId = route.id;

      route.instrument({
        async loader(callLoader, info) {
          const urlPath = getPathFromRequest(info.request);
          const pattern = getPattern(info);
          const routePattern = normalizeRoutePath(pattern) || urlPath;
          updateRootSpanWithRoute(info.request.method, pattern, urlPath);

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'loader',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callLoader();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.loader', {
                  'http.method': info.request.method,
                  [URL_FULL]: urlPath,
                });
              }
            },
          );
        },

        async action(callAction, info) {
          const urlPath = getPathFromRequest(info.request);
          const pattern = getPattern(info);
          const routePattern = normalizeRoutePath(pattern) || urlPath;
          updateRootSpanWithRoute(info.request.method, pattern, urlPath);

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'action',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callAction();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.action', {
                  'http.method': info.request.method,
                  [URL_FULL]: urlPath,
                });
              }
            },
          );
        },

        async middleware(callMiddleware, info) {
          const urlPath = getPathFromRequest(info.request);
          const pattern = getPattern(info);
          const routePattern = normalizeRoutePath(pattern) || urlPath;

          updateRootSpanWithRoute(info.request.method, pattern, urlPath);

          const activeSpan = getActiveSpan();
          const rootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;
          let middlewareIndex = 0;
          if (rootSpan) {
            let counters = middlewareCountersByRootSpan.get(rootSpan);
            if (!counters) {
              counters = {};
              middlewareCountersByRootSpan.set(rootSpan, counters);
            }
            middlewareIndex = counters[routeId] ?? 0;
            counters[routeId] = middlewareIndex + 1;
          }

          const middlewareName = getMiddlewareName(routeId, middlewareIndex);

          await startSpan(
            {
              name: `middleware ${middlewareName || routeId}`,
              attributes: {
                [SENTRY_OP]: WEB_SERVER_MIDDLEWARE_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'middleware',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
                'react_router.route.id': routeId,
                [HTTP_ROUTE]: routePattern,
                ...(middlewareName && { 'react_router.middleware.name': middlewareName }),
                'react_router.middleware.index': middlewareIndex,
              },
            },
            async span => {
              const result = await callMiddleware();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.middleware', {
                  'http.method': info.request.method,
                  [URL_FULL]: urlPath,
                });
              }
            },
          );
        },

        async lazy(callLazy) {
          await startSpan(
            {
              name: 'Lazy Route Load',
              attributes: {
                [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'lazy',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callLazy();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.lazy', {});
              }
            },
          );
        },
      });
    },
  };
}

function updateRootSpanWithRoute(method: string, pattern: string | undefined, urlPath: string): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) return;
  const rootSpan = getRootSpan(activeSpan);
  if (!rootSpan) return;

  // Skip update if URL path is invalid (failed to parse)
  if (!urlPath || urlPath === '<unknown>') {
    DEBUG_BUILD && debug.warn('Cannot update span with invalid URL path:', urlPath);
    return;
  }

  const hasPattern = !!pattern;
  const routeName = hasPattern ? normalizeRoutePath(pattern) || urlPath : urlPath;

  const transactionName = `${method} ${routeName}`;
  updateSpanName(rootSpan, transactionName);
  rootSpan.setAttributes({
    [HTTP_ROUTE]: routeName,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: hasPattern ? 'route' : 'url',
  });

  // Also update the scope's transaction name so errors captured during this request
  // have the correct transaction name (not the initial placeholder like "GET *")
  getCurrentScope().setTransactionName(transactionName);
}
