import type { RouteDefinition, RouteSectionProps, RouterInstance, RouterProps } from '@solidjs/router';
import { useBeforeLeave, useLocation, useRouteMatches } from '@solidjs/router';
import { createEffect, merge } from 'solid-js';
import { createRouterSpanUpdater } from '../solidrouter-shared';

export { solidRouterBrowserTracingIntegration } from '../solidrouter-shared';

/**
 * Instruments a Solid Router 2 instance (the return value of `createRouter`) to create navigation spans
 * and name pageload and navigation spans after the matched route.
 *
 * The returned router keeps every property of the original instance (`match`, `paths`, ...).
 */
export function withSentryRouterRouting<R extends RouterInstance<readonly RouteDefinition[]>>(Router: R): R {
  // A proxy keeps the instance's own properties, while calls render the router with an instrumented root.
  return new Proxy(Router, {
    apply(target, thisArg, [props]: [RouterProps]) {
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
