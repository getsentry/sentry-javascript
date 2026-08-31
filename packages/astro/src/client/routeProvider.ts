import type { RouteProvider } from '@sentry/core';
import { WINDOW } from '@sentry/browser';

/**
 * Reads the parameterized route the Astro middleware injects into the document it rendered.
 */
function readRouteNameFromMeta(): string | undefined {
  const optionalDocument = WINDOW.document as (typeof WINDOW)['document'] | undefined;
  const content = optionalDocument?.querySelector('meta[name=sentry-route-name]')?.getAttribute('content');
  if (!content) {
    return undefined;
  }

  try {
    return decodeURIComponent(content);
  } catch {
    // The middleware encodes the route, so a value we can't decode isn't one we put there.
    return undefined;
  }
}

/**
 * A route provider backed by the `sentry-route-name` meta tag the Astro middleware injects.
 *
 * Unlike a manifest-backed provider this is not a matcher: the document only ever describes the page
 * it rendered, so a URL other than the current one resolves to `undefined` rather than a guess.
 *
 * The tag does track client-side navigations. Astro's `ClientRouter` swaps it during
 * `astro:after-swap`, at the same moment `location` changes, so reading it per call stays correct
 * across soft navigations and back/forward. It is only stale *during* a navigation, before the swap,
 * which is why `resolveRoute` refuses to answer for anything but the current path.
 */
export function createAstroRouteProvider(): RouteProvider {
  const isCurrentPath = (url: URL): boolean => url.pathname === WINDOW.location?.pathname;

  return {
    resolveRoute: url => (isCurrentPath(url) ? readRouteNameFromMeta() : undefined),
    resolveCurrentRoute: readRouteNameFromMeta,
  };
}
