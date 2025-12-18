import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import {
  debug,
  flushIfServerless,
  getActiveSpan,
  getCurrentScope,
  getRootSpan,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  updateSpanName,
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import type { InstrumentableRequestHandler, InstrumentableRoute, ServerInstrumentation } from '../common/types';
import { captureInstrumentationError, getPathFromRequest, getPattern, normalizeRoutePath } from '../common/utils';

const SENTRY_SERVER_INSTRUMENTATION_FLAG = '__sentryReactRouterServerInstrumentationUsed';

type GlobalObjWithFlag = typeof GLOBAL_OBJ & {
  [SENTRY_SERVER_INSTRUMENTATION_FLAG]?: boolean;
};

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

  (GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_SERVER_INSTRUMENTATION_FLAG] = true;
  DEBUG_BUILD && debug.log('React Router server instrumentation API enabled.');

  return {
    handler(handler: InstrumentableRequestHandler) {
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
            });

            try {
              const result = await handleRequest();
              captureInstrumentationError(result, captureErrors, 'react_router.request_handler', {
                'http.method': info.request.method,
                'http.url': pathname,
              });
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
              async () => {
                try {
                  const result = await handleRequest();
                  captureInstrumentationError(result, captureErrors, 'react_router.request_handler', {
                    'http.method': info.request.method,
                    'http.url': pathname,
                  });
                } finally {
                  await flushIfServerless();
                }
              },
            );
          }
        },
      });
    },

    route(route: InstrumentableRoute) {
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.loader',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callLoader();
              captureInstrumentationError(result, captureErrors, 'react_router.loader', {
                'http.method': info.request.method,
                'http.url': urlPath,
              });
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.action',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callAction();
              captureInstrumentationError(result, captureErrors, 'react_router.action', {
                'http.method': info.request.method,
                'http.url': urlPath,
              });
            },
          );
        },

        async middleware(callMiddleware, info) {
          const urlPath = getPathFromRequest(info.request);
          const pattern = getPattern(info);
          const routePattern = normalizeRoutePath(pattern) || urlPath;

          // Update root span with parameterized route (same as loader/action)
          updateRootSpanWithRoute(info.request.method, pattern, urlPath);

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.middleware',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callMiddleware();
              captureInstrumentationError(result, captureErrors, 'react_router.middleware', {
                'http.method': info.request.method,
                'http.url': urlPath,
              });
            },
          );
        },

        async lazy(callLazy) {
          await startSpan(
            {
              name: 'Lazy Route Load',
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react-router.lazy',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callLazy();
              captureInstrumentationError(result, captureErrors, 'react_router.lazy', {});
            },
          );
        },
      });
    },
  };
}

/**
 * Check if React Router's instrumentation API is being used on the server.
 * @experimental
 */
export function isInstrumentationApiUsed(): boolean {
  return !!(GLOBAL_OBJ as GlobalObjWithFlag)[SENTRY_SERVER_INSTRUMENTATION_FLAG];
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
