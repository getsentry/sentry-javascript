import {
  browserTracingIntegration,
  getAbsoluteUrl,
  getActiveSpan,
  getRootSpan,
  spanToJSON,
  startBrowserTracingNavigationSpan,
} from '@sentry/browser';
import {
  PARAMS_KEY_BASE,
  SENTRY_OP,
  SENTRY_ORIGIN,
  SENTRY_SEGMENT_NAME_SOURCE,
  URL_FULL,
  URL_PATH,
  URL_PATH_PARAMETER_KEY_BASE,
  URL_TEMPLATE,
} from '@sentry/conventions/attributes';
import { NAVIGATION } from '@sentry/conventions/op';
import type { Integration } from '@sentry/core';
import { filterCollectedUrl, getClient, hasSpanStreamingEnabled, NAVIGATION_SPAN_NAME_FALLBACK } from '@sentry/core';
import type { Client } from '@sentry/core';

/** The parts of a Solid Router location the span updates read. Shared by Solid Router 1 and 2. */
export interface RouterLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

/** The parts of a Solid Router route match the span updates read. Shared by Solid Router 1 and 2. */
export interface RouterMatch {
  route: { pattern: string };
  params: Record<string, string | undefined>;
}

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

function locationToSpanUrlAttributes(pathname: string, search: string = '', hash: string = ''): Record<string, string> {
  const pathWithSearch = `${pathname}${search}${hash}`;

  return {
    [URL_PATH]: pathname,
    [URL_FULL]: filterCollectedUrl(getAbsoluteUrl(pathWithSearch)),
  };
}

function handleNavigation(location: string, isHistoryTraversal: boolean): void {
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

  startBrowserTracingNavigationSpan(
    client,
    {
      // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
      name: hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : location,
      attributes: {
        [SENTRY_OP]: NAVIGATION,
        [SENTRY_ORIGIN]: `auto.navigation.${framework}.solidrouter`,
        [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
      },
    },
    isHistoryTraversal ? undefined : { url: getAbsoluteUrl(location) },
  );
}

function getActiveRootSpan(): ReturnType<typeof getActiveSpan> {
  const span = getActiveSpan();
  return span ? getRootSpan(span) : undefined;
}

/**
 * Starts navigation spans and names the active root span after the matched route.
 * The router wrappers call `onBeforeLeave` from `useBeforeLeave` and `onRouteChange` from an effect
 * that tracks the location and the route matches.
 */
export function createRouterSpanUpdater(): {
  onBeforeLeave: (to: string | number) => void;
  onRouteChange: (location: RouterLocation, matches: RouterMatch[]) => void;
} {
  // Tracks the target of a pending navigation, so stale updates during <Navigate> redirects
  // can be skipped while the location signal hasn't caught up to the navigation span yet.
  let pendingNavigationTarget: string | undefined;
  // Back and forward navigations only know the history delta (e.g. `-1` or `2`) upfront, not the target URL.
  let historyTraversalSpanName: string | undefined;

  return {
    onBeforeLeave(to) {
      const isHistoryTraversal = typeof to === 'number';
      const location = String(to);
      pendingNavigationTarget = isHistoryTraversal ? undefined : location;
      historyTraversalSpanName = isHistoryTraversal ? location : undefined;
      handleNavigation(location, isHistoryTraversal);
    },
    onRouteChange(location, matches) {
      const name = location.pathname;
      const rootSpan = getActiveRootSpan();
      if (!rootSpan) {
        return;
      }

      // During <Navigate> redirects, the effect can fire before the router
      // transition completes. In that case, location.pathname still points
      // to the old route while the active span is already the navigation span.
      // Skip the update to avoid overwriting the span with stale route data.
      if (pendingNavigationTarget && name !== pendingNavigationTarget) {
        return;
      }
      pendingNavigationTarget = undefined;

      const lastMatch = matches[matches.length - 1];
      const urlAttributes = locationToSpanUrlAttributes(name, location.search, location.hash);

      if (lastMatch) {
        const parametrizedRoute = lastMatch.route.pattern || name;
        rootSpan.updateName(parametrizedRoute);
        rootSpan.setAttributes({
          [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
          [URL_TEMPLATE]: parametrizedRoute,
          ...urlAttributes,
        });

        for (const [key, value] of Object.entries(lastMatch.params)) {
          if (value !== undefined) {
            rootSpan.setAttribute(`${URL_PATH_PARAMETER_KEY_BASE}.${key}`, value);
            rootSpan.setAttribute(`${PARAMS_KEY_BASE}.${key}`, value);
          }
        }
      } else {
        // No matched route - update history traversals and set source to url
        const { attributes, name: spanName } = spanToJSON(rootSpan);
        // With span streaming, a history traversal span is already named `Navigation` (there is no
        // target URL upfront), so only the static lifecycle still has the delta to replace here.
        if (attributes[SENTRY_OP] === NAVIGATION && spanName === historyTraversalSpanName) {
          rootSpan.updateName(name);
        }
        rootSpan.setAttributes({ [SENTRY_SEGMENT_NAME_SOURCE]: 'url', ...urlAttributes });
      }
      historyTraversalSpanName = undefined;
    },
  };
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
