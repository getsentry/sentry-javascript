import {
  browserTracingIntegration,
  getActiveSpan,
  getRootSpan,
  spanToJSON,
  startBrowserTracingNavigationSpan,
} from '@sentry/browser';
import type { Client, Integration, Span } from '@sentry/core';
import {
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import type {
  BeforeLeaveEventArgs,
  HashRouter,
  MemoryRouter,
  Router as BaseRouter,
  RouteSectionProps,
  StaticRouter,
} from '@solidjs/router';
import { useBeforeLeave, useCurrentMatches, useLocation } from '@solidjs/router';
import type { Component, JSX, ParentProps } from 'solid-js';
import { createEffect, mergeProps, splitProps } from 'solid-js';
import { createComponent } from 'solid-js/web';

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

function handleNavigation(location: string): void {
  const client = getClient();
  if (!client || !CLIENTS_WITH_INSTRUMENT_NAVIGATION.has(client)) {
    return;
  }

  // The solid router integration will be used for both solid and solid start.
  // To avoid increasing the api surface with internal properties, we look at
  // the sdk metadata.
  const metaData = client.getSdkMetadata();
  const { name } = metaData?.sdk || {};
  const framework = name?.includes('solidstart') ? 'solidstart' : 'solid';

  startBrowserTracingNavigationSpan(client, {
    name: location,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: `auto.navigation.${framework}.solidrouter`,
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });
}

function getActiveRootSpan(): Span | undefined {
  const span = getActiveSpan();
  return span ? getRootSpan(span) : undefined;
}

/** Pass-through component in case user didn't specify a root **/
function SentryDefaultRoot(props: ParentProps): JSX.Element {
  return props.children;
}

/**
 * Unfortunately, we cannot use router hooks directly in the Router, so we
 * need to wrap the `root` prop to instrument navigation.
 */
function withSentryRouterRoot(Root: Component<RouteSectionProps>): Component<RouteSectionProps> {
  const SentryRouterRoot = (props: RouteSectionProps): JSX.Element => {
    // Tracks the target of a pending navigation, so the effect can skip
    // stale updates during <Navigate> redirects where the location signal
    // hasn't caught up to the navigation span yet.
    let pendingNavigationTarget: string | undefined;

    useBeforeLeave(({ to }: BeforeLeaveEventArgs) => {
      const target = to.toString();
      pendingNavigationTarget = target;
      handleNavigation(target);
    });

    const location = useLocation();
    const matches = useCurrentMatches();

    createEffect(() => {
      const name = location.pathname;
      const rootSpan = getActiveRootSpan();
      if (!rootSpan) {
        return;
      }

      // During <Navigate> redirects, the effect can fire before the router
      // transition completes. In that case, location.pathname still points
      // to the old route while the active span is already the navigation span.
      // Skip the update to avoid overwriting the span with stale route data.
      // `-1` is solid router's representation of a browser back-button
      // navigation, where we don't know the target URL upfront.
      if (pendingNavigationTarget && pendingNavigationTarget !== '-1' && name !== pendingNavigationTarget) {
        return;
      }
      pendingNavigationTarget = undefined;

      const currentMatches = matches();
      const lastMatch = currentMatches[currentMatches.length - 1];

      if (lastMatch) {
        const parametrizedRoute = lastMatch.route.pattern || name;
        rootSpan.updateName(parametrizedRoute);
        rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

        const params = lastMatch.params;
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) {
            rootSpan.setAttribute(`url.path.parameter.${key}`, value);
            rootSpan.setAttribute(`params.${key}`, value);
          }
        }
      } else {
        // No matched route - update back-button navigations and set source to url
        const { op, description } = spanToJSON(rootSpan);
        if (op === 'navigation' && description === '-1') {
          rootSpan.updateName(name);
        }
        rootSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'url');
      }
    });

    return createComponent(Root, props);
  };

  return SentryRouterRoot;
}

/**
 * A browser tracing integration that uses Solid Router to instrument navigations.
 */
export function solidRouterBrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] = {},
): Integration {
  const integration = browserTracingIntegration({
    ...options,
    instrumentNavigation: false,
  });

  const { instrumentNavigation = true } = options;

  return {
    ...integration,
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      if (instrumentNavigation) {
        CLIENTS_WITH_INSTRUMENT_NAVIGATION.add(client);
      }
    },
  };
}

type RouterType = typeof BaseRouter | typeof HashRouter | typeof MemoryRouter | typeof StaticRouter;

/**
 * A higher-order component to instrument Solid Router to create navigation spans.
 */
export function withSentryRouterRouting(Router: RouterType): RouterType {
  const SentryRouter = (props: Parameters<RouterType>[0]): JSX.Element => {
    const [local, others] = splitProps(props, ['root']);
    // We need to wrap root here in case the user passed in their own root
    const Root = withSentryRouterRoot(local.root ? local.root : SentryDefaultRoot);

    return createComponent(Router, mergeProps({ root: Root }, others));
  };

  return SentryRouter;
}
