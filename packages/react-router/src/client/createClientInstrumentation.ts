import { startBrowserTracingNavigationSpan } from '@sentry/browser';
import {
  debug,
  getClient,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import type { ClientInstrumentation, InstrumentableRoute, InstrumentableRouter } from '../common/types';
import { captureInstrumentationError, getPathFromRequest, getPattern, normalizeRoutePath } from '../common/utils';

const SENTRY_CLIENT_INSTRUMENTATION_FLAG = '__sentryReactRouterClientInstrumentationUsed';
// Intentionally never reset - once set, instrumentation API handles all navigations for the session.
const SENTRY_NAVIGATE_HOOK_INVOKED_FLAG = '__sentryReactRouterNavigateHookInvoked';

type GlobalObjWithFlags = typeof GLOBAL_OBJ & {
  [SENTRY_CLIENT_INSTRUMENTATION_FLAG]?: boolean;
  [SENTRY_NAVIGATE_HOOK_INVOKED_FLAG]?: boolean;
};

/**
 * Options for creating Sentry client instrumentation.
 */
export interface CreateSentryClientInstrumentationOptions {
  /**
   * Whether to capture errors from loaders/actions automatically.
   * @default true
   */
  captureErrors?: boolean;
}

/**
 * Creates a Sentry client instrumentation for React Router's instrumentation API.
 * @experimental
 */
export function createSentryClientInstrumentation(
  options: CreateSentryClientInstrumentationOptions = {},
): ClientInstrumentation {
  const { captureErrors = true } = options;

  (GLOBAL_OBJ as GlobalObjWithFlags)[SENTRY_CLIENT_INSTRUMENTATION_FLAG] = true;
  DEBUG_BUILD && debug.log('React Router client instrumentation API enabled.');

  return {
    router(router: InstrumentableRouter) {
      router.instrument({
        async navigate(callNavigate, info) {
          (GLOBAL_OBJ as GlobalObjWithFlags)[SENTRY_NAVIGATE_HOOK_INVOKED_FLAG] = true;

          // Skip numeric navigations (history back/forward like navigate(-1))
          // since we can't resolve them to meaningful route names
          if (typeof info.to === 'number') {
            const result = await callNavigate();
            captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
              'http.url': info.currentUrl,
            });
            return;
          }

          const client = getClient();
          const toPath = String(info.to);

          if (client) {
            startBrowserTracingNavigationSpan(client, {
              name: toPath,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
              },
            });
          }

          const result = await callNavigate();
          captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
            'http.url': toPath,
          });
        },

        async fetch(callFetch, info) {
          await startSpan(
            {
              name: `Fetcher ${info.fetcherKey}`,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.fetcher',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callFetch();
              captureInstrumentationError(result, captureErrors, 'react_router.fetcher', {
                'http.url': info.href,
              });
            },
          );
        },
      });
    },

    route(route: InstrumentableRoute) {
      route.instrument({
        async loader(callLoader, info) {
          const urlPath = getPathFromRequest(info.request);
          const routePattern = normalizeRoutePath(getPattern(info)) || urlPath;

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.client_loader',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callLoader();
              captureInstrumentationError(result, captureErrors, 'react_router.client_loader', {
                'http.url': urlPath,
              });
            },
          );
        },

        async action(callAction, info) {
          const urlPath = getPathFromRequest(info.request);
          const routePattern = normalizeRoutePath(getPattern(info)) || urlPath;

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.client_action',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callAction();
              captureInstrumentationError(result, captureErrors, 'react_router.client_action', {
                'http.url': urlPath,
              });
            },
          );
        },

        async middleware(callMiddleware, info) {
          const urlPath = getPathFromRequest(info.request);
          const routePattern = normalizeRoutePath(getPattern(info)) || urlPath;

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.client_middleware',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callMiddleware();
              captureInstrumentationError(result, captureErrors, 'react_router.client_middleware', {
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.client_lazy',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async () => {
              const result = await callLazy();
              captureInstrumentationError(result, captureErrors, 'react_router.client_lazy', {});
            },
          );
        },
      });
    },
  };
}

/**
 * Check if React Router's instrumentation API is being used on the client.
 * @experimental
 */
export function isClientInstrumentationApiUsed(): boolean {
  return !!(GLOBAL_OBJ as GlobalObjWithFlags)[SENTRY_CLIENT_INSTRUMENTATION_FLAG];
}

/**
 * Check if React Router's instrumentation API's navigate hook was invoked.
 * @experimental
 */
export function isNavigateHookInvoked(): boolean {
  return !!(GLOBAL_OBJ as GlobalObjWithFlags)[SENTRY_NAVIGATE_HOOK_INVOKED_FLAG];
}
