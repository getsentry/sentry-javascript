import { context, createContextKey } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
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
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import type { InstrumentableRequestHandler, InstrumentableRoute, ServerInstrumentation } from '../common/types';
import { captureInstrumentationError, getPathFromRequest, getPattern, normalizeRoutePath } from '../common/utils';
import { getMiddlewareName } from './serverBuild';
import { markInstrumentationApiUsed } from './serverGlobals';

const MIDDLEWARE_COUNTER_KEY = createContextKey('sentry_react_router_middleware_counter');

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
 * @experimental
 */
export function createSentryServerInstrumentation(
  options: CreateSentryServerInstrumentationOptions = {},
): ServerInstrumentation {
  const { captureErrors = true } = options;

  markInstrumentationApiUsed();
  DEBUG_BUILD && debug.log('React Router server instrumentation API enabled.');

  return {
    handler(handler: InstrumentableRequestHandler) {
      handler.instrument({
        async request(handleRequest, info) {
          const pathname = getPathFromRequest(info.request);
          const activeSpan = getActiveSpan();
          const existingRootSpan = activeSpan ? getRootSpan(activeSpan) : undefined;

          const counterStore = { counters: {} as Record<string, number> };
          const ctx = context.active().setValue(MIDDLEWARE_COUNTER_KEY, counterStore);

          await context.with(ctx, async () => {
            if (existingRootSpan) {
              updateSpanName(existingRootSpan, `${info.request.method} ${pathname}`);
              existingRootSpan.setAttributes({
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.react_router.instrumentation_api',
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              });

              try {
                const result = await handleRequest();
                if (result.status === 'error' && result.error instanceof Error) {
                  existingRootSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                  captureInstrumentationError(result, captureErrors, 'react_router.request_handler', {
                    'http.method': info.request.method,
                    'http.url': pathname,
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
                    'http.request.method': info.request.method,
                    'url.path': pathname,
                    'url.full': info.request.url,
                  },
                },
                async span => {
                  try {
                    const result = await handleRequest();
                    if (result.status === 'error' && result.error instanceof Error) {
                      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                      captureInstrumentationError(result, captureErrors, 'react_router.request_handler', {
                        'http.method': info.request.method,
                        'http.url': pathname,
                      });
                    }
                  } finally {
                    await flushIfServerless();
                  }
                },
              );
            }
          });
        },
      });
    },

    route(route: InstrumentableRoute) {
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.loader',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callLoader();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.loader', {
                  'http.method': info.request.method,
                  'http.url': urlPath,
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.action',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callAction();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.action', {
                  'http.method': info.request.method,
                  'http.url': urlPath,
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

          const counterStore = context.active().getValue(MIDDLEWARE_COUNTER_KEY) as
            | { counters: Record<string, number> }
            | undefined;
          let middlewareIndex = 0;
          if (counterStore) {
            middlewareIndex = counterStore.counters[routeId] ?? 0;
            counterStore.counters[routeId] = middlewareIndex + 1;
          }

          const middlewareName = getMiddlewareName(routeId, middlewareIndex);

          await startSpan(
            {
              name: `middleware ${middlewareName || routeId}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.middleware',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
                'react_router.route.id': routeId,
                'react_router.route.pattern': routePattern,
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
                  'http.url': urlPath,
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.lazy',
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

  const rpcMetadata = getRPCMetadata(context.active());
  if (rpcMetadata?.type === RPCType.HTTP) {
    rpcMetadata.route = routeName;
  }

  const transactionName = `${method} ${routeName}`;
  updateSpanName(rootSpan, transactionName);
  rootSpan.setAttributes({
    [ATTR_HTTP_ROUTE]: routeName,
    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: hasPattern ? 'route' : 'url',
  });

  // Also update the scope's transaction name so errors captured during this request
  // have the correct transaction name (not the initial placeholder like "GET *")
  getCurrentScope().setTransactionName(transactionName);
}
