import {
  HTTP_ROUTE,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_PATH_PARAMETER_KEY_BASE,
} from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { getActiveSpan, getCurrentScope, getRootSpan, spanToJSON, updateSpanName } from '@sentry/core';
import type { RouteDefinition, RouteSectionProps, RouterInstance, RouterProps } from '@solidjs/router';
import { useBeforeLeave, useLocation, useRouteMatches } from '@solidjs/router';
import { getRequestEvent, isServer } from '@solidjs/web';
import { createEffect, merge } from 'solid-js';
import { createRouterSpanUpdater } from '../solidrouter-shared';

export { solidRouterBrowserTracingIntegration } from '../solidrouter-shared';

/**
 * Names the active `http.server` span after the route the request matched, e.g. `GET /user/:id`.
 */
function nameServerSpanAfterRoute(Router: RouterInstance<readonly RouteDefinition[]>, url: string | undefined): void {
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

  const matches = Router.match(requestUrl);
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) {
    return;
  }

  const transactionName = `${request?.method ?? 'GET'} ${lastMatch.pattern}`;
  updateSpanName(rootSpan, transactionName);
  rootSpan.setAttributes({
    [HTTP_ROUTE]: lastMatch.pattern,
    [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
  });
  for (const [key, value] of Object.entries(lastMatch.params)) {
    if (typeof value === 'string') {
      rootSpan.setAttribute(`${URL_PATH_PARAMETER_KEY_BASE}.${key}`, value);
    }
  }
  // Errors captured later in the request carry the route name too.
  getCurrentScope().setTransactionName(transactionName);
}

/**
 * Instruments a Solid Router 2 instance (the return value of `createRouter`) to create navigation spans
 * and name pageload and navigation spans after the matched route. On the server, it names the
 * `http.server` span after the matched route.
 *
 * The returned router keeps every property of the original instance (`match`, `paths`, ...).
 */
export function withSentryRouterRouting<R extends RouterInstance<readonly RouteDefinition[]>>(Router: R): R {
  // A proxy keeps the instance's own properties, while calls render the router with an instrumented root.
  return new Proxy(Router, {
    apply(target, thisArg, [props]: [RouterProps]) {
      if (isServer) {
        nameServerSpanAfterRoute(target, props.url);
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
        );

        return userRoot ? userRoot(sectionProps) : sectionProps.children;
      };

      return Reflect.apply(target, thisArg, [merge(props, { children })]);
    },
  });
}
