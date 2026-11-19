import {
  HTTP_REQUEST_METHOD,
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH,
  URL_PATH_PARAMETER_KEY_BASE,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import type { Client, Span } from '@sentry/core';
import { getActiveSpan, getClient, getCurrentScope, getRootSpan, spanToJSON, updateSpanName } from '@sentry/core';
import type { RouteDefinition, RouteSectionProps, RouterInstance, RouterProps } from '@solidjs/router';
import { useBeforeLeave, useLocation, useRouteMatches } from '@solidjs/router';
import { getRequestEvent, isServer } from '@solidjs/web';
import { createEffect, merge } from 'solid-js';
import { createRouterSpanUpdater } from '../solidrouter-shared';

export { solidRouterBrowserTracingIntegration } from '../solidrouter-shared';

type SolidRouter = RouterInstance<readonly RouteDefinition[]>;

/** The router the server renders with, kept so `http.server` spans can be named when they start. */
let serverRouter: SolidRouter | undefined;
const CLIENTS_NAMING_SERVER_SPANS = new WeakSet<Client>();

/**
 * Names an `http.server` span after the route its URL matches, e.g. `GET /user/:id`.
 * Returns the new name, or `undefined` when no route matches.
 */
function nameServerSpanAfterRoute(span: Span, router: SolidRouter, path: string, method: string): string | undefined {
  const matches = router.match(path);
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) {
    return undefined;
  }

  // Solid Router reports the root route's pattern as an empty string.
  const route = lastMatch.pattern || '/';
  const name = `${method} ${route}`;
  updateSpanName(span, name);
  span.setAttributes({
    [HTTP_ROUTE]: route,
    [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
  });
  for (const [key, value] of Object.entries(lastMatch.params)) {
    if (typeof value === 'string') {
      span.setAttribute(`${URL_PATH_PARAMETER_KEY_BASE}.${key}`, value);
    }
  }
  return name;
}

/**
 * Names `http.server` spans as soon as they start, so everything in the request sees the route name.
 * The router is created when the app module loads, after `init` ran in `start.serverSetup`.
 */
function nameServerSpansOnStart(router: SolidRouter): void {
  serverRouter = router;

  const client = getClient();
  if (!client || CLIENTS_NAMING_SERVER_SPANS.has(client)) {
    return;
  }
  CLIENTS_NAMING_SERVER_SPANS.add(client);

  client.on('spanStart', span => {
    const { attributes } = spanToJSON(span);
    const path = attributes?.[URL_PATH];
    if (!serverRouter || attributes?.[SENTRY_OP] !== HTTP_SERVER || typeof path !== 'string') {
      return;
    }
    const method = attributes[HTTP_REQUEST_METHOD];
    nameServerSpanAfterRoute(span, serverRouter, path, typeof method === 'string' ? method : 'GET');
  });
}

/**
 * Names the request's `http.server` span while the page renders, and the transaction errors in the request carry.
 * Covers the case where `init` ran after the router was created.
 */
function nameServerSpanOnRender(router: SolidRouter, url: string | undefined): void {
  const request = getRequestEvent()?.request;
  const requestUrl = request?.url ?? url;
  const activeSpan = getActiveSpan();
  if (!requestUrl || !activeSpan) {
    return;
  }

  const rootSpan = getRootSpan(activeSpan);
  if (spanToJSON(rootSpan).attributes?.[SENTRY_OP] !== HTTP_SERVER) {
    return;
  }

  const name = nameServerSpanAfterRoute(rootSpan, router, requestUrl, request?.method ?? 'GET');
  if (name) {
    getCurrentScope().setTransactionName(name);
  }
}

/**
 * Instruments a Solid Router 2 instance (the return value of `createRouter`) to create navigation spans
 * and name pageload and navigation spans after the matched route. On the server, it names the
 * `http.server` span after the matched route.
 *
 * The returned router keeps every property of the original instance (`match`, `paths`, ...).
 */
export function withSentryRouterRouting<R extends RouterInstance<readonly RouteDefinition[]>>(Router: R): R {
  if (isServer) {
    nameServerSpansOnStart(Router);
  }

  // A proxy keeps the instance's own properties, while calls render the router with an instrumented root.
  return new Proxy(Router, {
    apply(target, thisArg, [props]: [RouterProps]) {
      if (isServer) {
        nameServerSpanOnRender(target, props.url);
        // The navigation hooks below need the browser router, so the server renders the router unchanged.
        return Reflect.apply(target, thisArg, [props]);
      }

      const userRoot = props.children;

      const children = (sectionProps: RouteSectionProps): ReturnType<NonNullable<RouterProps['children']>> => {
        // The render prop runs inside the router, so router hooks are available here.
        const spanUpdater = createRouterSpanUpdater();

        useBeforeLeave(({ to }) => {
          spanUpdater.onBeforeLeave(to);
        });

        const location = useLocation();
        const matches = useRouteMatches();

        createEffect(
          () => ({
            location: { pathname: location.pathname, search: location.search, hash: location.hash },
            matches: matches(),
          }),
          ({ location, matches }) => {
            spanUpdater.onRouteChange(location, matches);
          },
          // The server never creates this effect, so it must not take a hydration id.
          { transparent: true },
        );

        return userRoot ? userRoot(sectionProps) : sectionProps.children;
      };

      return Reflect.apply(target, thisArg, [merge(props, { children })]);
    },
  });
}
