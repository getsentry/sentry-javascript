import { startBrowserTracingNavigationSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  debug,
  getClient,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SPAN_STATUS_ERROR,
  startSpan,
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import type { ClientInstrumentation, InstrumentableRoute, InstrumentableRouter } from '../common/types';
import { captureInstrumentationError, getPathFromRequest, getPattern, normalizeRoutePath } from '../common/utils';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

// Tracks active numeric navigation span to prevent duplicate spans when popstate fires
let currentNumericNavigationSpan: Span | undefined;

const SENTRY_CLIENT_INSTRUMENTATION_FLAG = '__sentryReactRouterClientInstrumentationUsed';
// Intentionally never reset - once set, instrumentation API handles all navigations for the session.
const SENTRY_NAVIGATE_HOOK_INVOKED_FLAG = '__sentryReactRouterNavigateHookInvoked';
const SENTRY_POPSTATE_LISTENER_ADDED_FLAG = '__sentryReactRouterPopstateListenerAdded';

type GlobalObjWithFlags = typeof GLOBAL_OBJ & {
  [SENTRY_CLIENT_INSTRUMENTATION_FLAG]?: boolean;
  [SENTRY_NAVIGATE_HOOK_INVOKED_FLAG]?: boolean;
  [SENTRY_POPSTATE_LISTENER_ADDED_FLAG]?: boolean;
};

const GLOBAL_WITH_FLAGS = GLOBAL_OBJ as GlobalObjWithFlags;

/**
 * Options for creating Sentry client instrumentation.
 */
export interface CreateSentryClientInstrumentationOptions {
  /**
   * Whether to capture errors from loaders/actions automatically.
   * Set to `false` to avoid duplicates if using custom error handlers.
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

  DEBUG_BUILD && debug.log('React Router client instrumentation API created.');

  return {
    router(router: InstrumentableRouter) {
      // Set the flag when React Router actually invokes our instrumentation.
      // This ensures the flag is only set in Library Mode (where hooks run),
      // not in Framework Mode (where hooks are never called).
      // See: https://github.com/remix-run/react-router/discussions/13749
      GLOBAL_WITH_FLAGS[SENTRY_CLIENT_INSTRUMENTATION_FLAG] = true;
      DEBUG_BUILD && debug.log('React Router client instrumentation API router hook registered.');

      // Add popstate listener for browser back/forward navigation (persists for session, one listener only)
      if (!GLOBAL_WITH_FLAGS[SENTRY_POPSTATE_LISTENER_ADDED_FLAG] && WINDOW.addEventListener) {
        GLOBAL_WITH_FLAGS[SENTRY_POPSTATE_LISTENER_ADDED_FLAG] = true;

        WINDOW.addEventListener('popstate', () => {
          const client = getClient();
          if (!client) {
            currentNumericNavigationSpan = undefined;
            return;
          }

          const pathname = WINDOW.location?.pathname || '/';

          // If there's an active numeric navigation span, update it instead of creating a duplicate
          if (currentNumericNavigationSpan) {
            if (currentNumericNavigationSpan.isRecording()) {
              currentNumericNavigationSpan.updateName(pathname);
            }
            currentNumericNavigationSpan = undefined;
            return;
          }

          // Only create a new span for actual browser back/forward button clicks
          startBrowserTracingNavigationSpan(client, {
            name: pathname,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
              'navigation.type': 'browser.popstate',
            },
          });
        });

        DEBUG_BUILD && debug.log('React Router popstate listener registered for browser back/forward navigation.');
      }

      router.instrument({
        async navigate(callNavigate, info) {
          // navigate(0) triggers a page reload - skip span creation, but still capture errors
          // (navigation can be rejected before reload, e.g., by a navigation guard)
          if (info.to === 0) {
            const result = await callNavigate();
            if (result.status === 'error' && result.error instanceof Error) {
              captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
                'http.url': info.currentUrl,
              });
            }
            return;
          }

          GLOBAL_WITH_FLAGS[SENTRY_NAVIGATE_HOOK_INVOKED_FLAG] = true;

          // Handle numeric navigations (navigate(-1), navigate(1), etc.)
          if (typeof info.to === 'number') {
            const client = getClient();
            let navigationSpan;

            if (client) {
              const navigationType = info.to < 0 ? 'router.back' : 'router.forward';
              const currentPathname = WINDOW.location?.pathname || info.currentUrl;

              navigationSpan = startBrowserTracingNavigationSpan(client, {
                name: currentPathname,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
                  'navigation.type': navigationType,
                },
              });

              // Store ref so popstate listener can update it instead of creating a duplicate
              currentNumericNavigationSpan = navigationSpan;
            }

            try {
              const result = await callNavigate();

              if (navigationSpan && WINDOW.location) {
                navigationSpan.updateName(WINDOW.location.pathname);
              }

              if (result.status === 'error' && result.error instanceof Error) {
                if (navigationSpan) {
                  navigationSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                }
                captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
                  'http.url': WINDOW.location?.pathname || info.currentUrl,
                });
              }
            } finally {
              currentNumericNavigationSpan = undefined;
            }
            return;
          }

          // Handle string navigations (e.g., navigate('/about'))
          const client = getClient();
          const toPath = String(info.to);
          let navigationSpan;

          if (client) {
            navigationSpan = startBrowserTracingNavigationSpan(client, {
              name: toPath,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
                'navigation.type': 'router.navigate',
              },
            });
          }

          const result = await callNavigate();
          if (result.status === 'error' && result.error instanceof Error) {
            if (navigationSpan) {
              navigationSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            }
            captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
              'http.url': toPath,
            });
          }
          return;
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
            async span => {
              const result = await callFetch();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.fetcher', {
                  'http.url': info.href,
                });
              }
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
            async span => {
              const result = await callLoader();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_loader', {
                  'http.url': urlPath,
                });
              }
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
            async span => {
              const result = await callAction();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_action', {
                  'http.url': urlPath,
                });
              }
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
            async span => {
              const result = await callMiddleware();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_middleware', {
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
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function.react_router.client_lazy',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callLazy();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_lazy', {});
              }
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
  return !!GLOBAL_WITH_FLAGS[SENTRY_CLIENT_INSTRUMENTATION_FLAG];
}

/**
 * Check if React Router's instrumentation API's navigate hook was invoked.
 * @experimental
 */
export function isNavigateHookInvoked(): boolean {
  return !!GLOBAL_WITH_FLAGS[SENTRY_NAVIGATE_HOOK_INVOKED_FLAG];
}
