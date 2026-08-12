// oxlint-disable max-lines
import { getAbsoluteUrl, startBrowserTracingNavigationSpan } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  debug,
  getActiveSpan,
  getClient,
  getRootSpan,
  GLOBAL_OBJ,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToJSON,
  SPAN_STATUS_ERROR,
  startSpan,
  updateSpanName,
  filterCollectedUrl,
} from '@sentry/core';
import { DEBUG_BUILD } from '../common/debug-build';
import type { ClientInstrumentation, InstrumentableRoute, InstrumentableRouter } from '../common/types';
import { captureInstrumentationError, getPathFromRequest, getPattern, normalizeRoutePath } from '../common/utils';
import {
  resolveNavigateAbsoluteUrl,
  resolveNavigateArg,
  finalizeNavigationSpanFromHydratedRouter,
  updateNavigationSpanUrlFromLocation,
} from './utils';
import { CODE_FUNCTION_NAME, SENTRY_OP, URL_FULL, URL_TEMPLATE } from '@sentry/conventions/attributes';
import { GENERAL_FUNCTION_SPAN_OP, WEB_SERVER_MIDDLEWARE_SPAN_OP } from '@sentry/conventions/op';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

// Tracks active numeric navigation span to prevent duplicate spans when popstate fires
let currentNumericNavigationSpan: Span | undefined;

// Per-request middleware counters, keyed by Request
const middlewareCountersMap = new WeakMap<object, Record<string, number>>();

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
              updateNavigationSpanUrlFromLocation(currentNumericNavigationSpan);
            }
            currentNumericNavigationSpan = undefined;
            return;
          }

          // Only create a new span for actual browser back/forward button clicks
          startBrowserTracingNavigationSpan(
            client,
            {
              name: pathname,
              attributes: {
                [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
                'navigation.type': 'browser.popstate',
              },
            },
            { url: getAbsoluteUrl(pathname) },
          );
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
                [URL_FULL]: filterCollectedUrl(info.currentUrl),
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

              navigationSpan = startBrowserTracingNavigationSpan(
                client,
                {
                  name: currentPathname,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
                    'navigation.type': navigationType,
                  },
                },
                { url: getAbsoluteUrl(currentPathname) },
              );

              // Store ref so popstate listener can update it instead of creating a duplicate
              currentNumericNavigationSpan = navigationSpan;
            }

            try {
              const result = await callNavigate();

              if (navigationSpan && WINDOW.location) {
                finalizeNavigationSpanFromHydratedRouter(navigationSpan);
              }

              if (result.status === 'error' && result.error instanceof Error) {
                if (navigationSpan) {
                  navigationSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                }
                captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
                  [URL_FULL]: WINDOW.location?.pathname || filterCollectedUrl(info.currentUrl),
                });
              }
            } finally {
              currentNumericNavigationSpan = undefined;
            }
            return;
          }

          // Handle string/object navigations (e.g., navigate('/about') or navigate({ pathname: '/about' }))
          const client = getClient();
          const toPath = resolveNavigateArg(info.to);
          let navigationSpan;

          if (client) {
            navigationSpan = startBrowserTracingNavigationSpan(
              client,
              {
                name: toPath,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
                  [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.react_router.instrumentation_api',
                  'navigation.type': 'router.navigate',
                },
              },
              { url: resolveNavigateAbsoluteUrl(info.to, info.currentUrl) },
            );
          }

          const result = await callNavigate();
          if (result.status === 'error' && result.error instanceof Error) {
            if (navigationSpan) {
              navigationSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            }
            captureInstrumentationError(result, captureErrors, 'react_router.navigate', {
              [URL_FULL]: filterCollectedUrl(toPath),
            });
          }
          return;
        },

        async fetch(callFetch, info) {
          await startSpan(
            {
              name: `Fetcher ${info.fetcherKey}`,
              attributes: {
                [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'fetcher',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callFetch();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.fetcher', {
                  [URL_FULL]: filterCollectedUrl(info.href),
                });
              }
            },
          );
        },
      });
    },

    route(route: InstrumentableRoute) {
      const routeId = route.id;

      route.instrument({
        async loader(callLoader, info) {
          const urlPath = getPathFromRequest(info.request);
          const pattern = normalizeRoutePath(getPattern(info));
          const routePattern = pattern || urlPath;
          // Parameterize the active navigation root span. (Route hooks don't fire on initial
          // pageload, so this only affects navigations.)
          updateRootSpanRoute(routePattern, !!pattern);

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'clientLoader',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callLoader();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_loader', {
                  [URL_FULL]: urlPath,
                });
              }
            },
          );
        },

        async action(callAction, info) {
          const urlPath = getPathFromRequest(info.request);
          const pattern = normalizeRoutePath(getPattern(info));
          const routePattern = pattern || urlPath;
          updateRootSpanRoute(routePattern, !!pattern);

          await startSpan(
            {
              name: routePattern,
              attributes: {
                [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'clientAction',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
              },
            },
            async span => {
              const result = await callAction();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_action', {
                  [URL_FULL]: urlPath,
                });
              }
            },
          );
        },

        async middleware(callMiddleware, info) {
          const urlPath = getPathFromRequest(info.request);
          const routePattern = normalizeRoutePath(getPattern(info)) || urlPath;

          let counters = middlewareCountersMap.get(info.request);
          if (!counters) {
            counters = {};
            middlewareCountersMap.set(info.request, counters);
          }

          const middlewareIndex = counters[routeId] ?? 0;
          counters[routeId] = middlewareIndex + 1;

          await startSpan(
            {
              name: `middleware ${routeId}`,
              attributes: {
                [SENTRY_OP]: WEB_SERVER_MIDDLEWARE_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'clientMiddleware',
                [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.react_router.instrumentation_api',
                'react_router.route.id': routeId,
                'http.route': routePattern,
                'react_router.middleware.index': middlewareIndex,
              },
            },
            async span => {
              const result = await callMiddleware();
              if (result.status === 'error' && result.error instanceof Error) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
                captureInstrumentationError(result, captureErrors, 'react_router.client_middleware', {
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
                [SENTRY_OP]: GENERAL_FUNCTION_SPAN_OP,
                [CODE_FUNCTION_NAME]: 'lazy',
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
 * Updates the active navigation/pageload root span name with the parameterized route, so the
 * transaction reflects the parameterized route pattern (e.g. `/users/:id`).
 */
function updateRootSpanRoute(routeName: string, hasPattern: boolean): void {
  if (!hasPattern) {
    return;
  }

  const activeSpan = getActiveSpan();
  const rootSpan = activeSpan && getRootSpan(activeSpan);
  if (!rootSpan) {
    return;
  }

  const { attributes } = spanToJSON(rootSpan);
  const op = attributes[SENTRY_OP];
  if (op !== 'navigation' && op !== 'pageload') {
    return;
  }

  updateSpanName(rootSpan, routeName);
  rootSpan.setAttributes({ [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route', [URL_TEMPLATE]: routeName });
}

/**
 * Check if React Router's instrumentation API is being used on the client.
 */
export function isClientInstrumentationApiUsed(): boolean {
  return !!GLOBAL_WITH_FLAGS[SENTRY_CLIENT_INSTRUMENTATION_FLAG];
}

/**
 * Check if React Router's instrumentation API's navigate hook was invoked.
 */
export function isNavigateHookInvoked(): boolean {
  return !!GLOBAL_WITH_FLAGS[SENTRY_NAVIGATE_HOOK_INVOKED_FLAG];
}
