import { getAbsoluteUrl } from '@sentry/browser';
import type { Span } from '@sentry/core';
import {
  getClient,
  GLOBAL_OBJ,
  hasSpanStreamingEnabled,
  NAVIGATION_SPAN_NAME_FALLBACK,
  filterCollectedUrl,
} from '@sentry/core';
import { SENTRY_SEGMENT_NAME_SOURCE, URL_FULL, URL_PATH, URL_TEMPLATE } from '@sentry/conventions/attributes';
import type { DataRouter, RouterState } from 'react-router';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

const GLOBAL_OBJ_WITH_DATA_ROUTER = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  __reactRouterDataRouter?: DataRouter;
};

/**
 * Resolves a navigate argument to a pathname string.
 *
 * React Router's navigate() accepts a string, number, or a To object ({ pathname, search, hash }).
 * All fields in the To object are optional (Partial<Path>), so we need to detect object args
 * to avoid "[object Object]" transaction names.
 */
export function resolveNavigateArg(target: unknown): string {
  if (typeof target !== 'object' || target === null) {
    // string or number
    return String(target);
  }

  // Object `to` with pathname
  const pathname = (target as Record<string, unknown>).pathname;
  if (typeof pathname === 'string') {
    return pathname || '/';
  }

  // Object `to` without pathname - navigation stays on current path
  return WINDOW.location?.pathname || '/';
}

/**
 * Resolves a navigate argument to the full destination path, preserving `search`/`hash` from a
 * To object. Unlike `resolveNavigateArg` (used for span/route naming, which should stay a bare
 * path), this is used to derive `url.full`/`url.path`, which should reflect the actual
 * destination the user is navigating to, including any query string.
 */
export function resolveNavigateUrl(target: unknown): string {
  if (typeof target !== 'object' || target === null) {
    // string or number
    return String(target);
  }

  const { pathname, search, hash } = target as Record<string, unknown>;
  const path = typeof pathname === 'string' && pathname !== '' ? pathname : WINDOW.location?.pathname || '/';

  return `${path}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`;
}

function getNavigateBaseUrl(currentUrl?: string): string {
  const origin = WINDOW.location?.origin || 'http://localhost';

  // Prefer the live pathname, but fall back to the hook-provided `currentUrl` (which may be a full
  // URL or a bare path) when `location` is unavailable (e.g. SSR/non-browser environments).
  let pathname = WINDOW.location?.pathname;
  if (!pathname && currentUrl) {
    try {
      pathname = new URL(currentUrl, origin).pathname;
    } catch {
      pathname = currentUrl.startsWith('/') ? currentUrl : `/${currentUrl}`;
    }
  }
  pathname = pathname || '/';

  // React Router resolves relative navigate targets against the current path treated as a
  // *directory* (it appends segments), whereas the WHATWG `URL` parser treats the last path
  // segment as a file and drops it. Enforce a trailing slash so relative resolution matches
  // React Router, e.g. `navigate('ssr')` from `/performance` -> `/performance/ssr` (not `/ssr`).
  const directory = pathname.endsWith('/') ? pathname : `${pathname}/`;

  return `${origin}${directory}`;
}

/**
 * Resolves a navigate argument to an absolute URL for `url.full`/`url.path`, correctly handling
 * relative targets (no leading slash) by resolving them against the current URL instead of the
 * document origin alone.
 */
export function resolveNavigateAbsoluteUrl(target: unknown, currentUrl?: string): string {
  const destination = resolveNavigateUrl(target);

  try {
    const resolved = new URL(destination, getNavigateBaseUrl(currentUrl));
    return getAbsoluteUrl(`${resolved.pathname}${resolved.search}${resolved.hash}`);
  } catch {
    return getAbsoluteUrl(destination);
  }
}

/**
 * Updates a navigation span's name and `url.path`/`url.full` from the current `location`.
 */
export function updateNavigationSpanUrlFromLocation(span: Span): void {
  if (!WINDOW.location) {
    return;
  }

  const { pathname, search = '', hash = '' } = WINDOW.location;
  const destinationUrl = getAbsoluteUrl(`${pathname}${search}${hash}`);

  // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
  const client = getClient();
  span.updateName(client && hasSpanStreamingEnabled(client) ? NAVIGATION_SPAN_NAME_FALLBACK : pathname);
  span.setAttributes({
    [SENTRY_SEGMENT_NAME_SOURCE]: 'url',
    [URL_PATH]: pathname,
    [URL_FULL]: filterCollectedUrl(destinationUrl),
  });
}

export function normalizePathname(pathname: string): string {
  let normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * The route template for the current match, or `undefined` when nothing matched.
 *
 * Built from the whole matched chain rather than the leaf alone: nested routes carry paths
 * relative to their parent, and index and layout routes carry none at all, so the leaf on its own
 * is either a fragment of the route (`edit`) or missing entirely.
 */
export function getRouteTemplate(routerState: RouterState): string | undefined {
  const { matches } = routerState;

  if (!matches.length) {
    return undefined;
  }

  let template = '';
  for (const match of matches) {
    const routePath = match.route.path;
    if (!routePath) {
      continue;
    }

    template = routePath.startsWith('/') ? routePath : `${template.replace(/\/$/, '')}/${routePath}`;
  }

  // A chain without any path only ever matches the root.
  return normalizePathname(template);
}

/**
 * Names a root span after the route the router matched.
 *
 * With span streaming there is nothing low cardinality to fall back to when nothing matched, so
 * the span keeps the name it started with rather than taking on the raw URL.
 */
export function updateSpanWithParameterizedRoute(span: Span, routerState: RouterState): void {
  const routeTemplate = getRouteTemplate(routerState);
  const client = getClient();

  if (!routeTemplate && client && hasSpanStreamingEnabled(client)) {
    return;
  }

  const parameterizedRoute = routeTemplate || normalizePathname(routerState.location.pathname);

  span.updateName(parameterizedRoute);
  span.setAttributes({
    [SENTRY_SEGMENT_NAME_SOURCE]: 'route',
    [URL_TEMPLATE]: parameterizedRoute,
  });
}

/**
 * Updates a navigation span's URL attributes and parameterizes its name from the router state.
 * Used after numeric navigations (`navigate(-1)` / `navigate(1)`) where route hooks may not
 * supply a pattern (e.g. index routes).
 *
 * `url.path` reflects raw `location.pathname` (may include a trailing slash when the server
 * redirects index routes), while `url.template` is normalized without trailing slashes.
 */
export function finalizeNavigationSpanFromRouterState(span: Span, routerState: RouterState): void {
  updateNavigationSpanUrlFromLocation(span);

  if (!WINDOW.location) {
    return;
  }

  const { pathname } = WINDOW.location;

  if (
    routerState.navigation?.state === 'idle' &&
    normalizePathname(routerState.location.pathname) === normalizePathname(pathname)
  ) {
    updateSpanWithParameterizedRoute(span, routerState);
  }
}

/**
 * Finalizes a navigation span after numeric navigation using the hydrated data router when
 * available, otherwise falls back to URL attributes from `location` alone.
 */
export function finalizeNavigationSpanFromHydratedRouter(span: Span): void {
  const router = GLOBAL_OBJ_WITH_DATA_ROUTER.__reactRouterDataRouter;
  if (router) {
    finalizeNavigationSpanFromRouterState(span, router.state);
  } else {
    updateNavigationSpanUrlFromLocation(span);
  }
}
