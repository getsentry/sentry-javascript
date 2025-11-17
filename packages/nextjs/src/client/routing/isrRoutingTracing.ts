import { WINDOW } from '@sentry/react';
import { getManifest, maybeParameterizeRoute } from './parameterization';

const IS_ISR_SSG_ROUTE_CACHE = new Map<string, boolean>();

/**
 * Check if the current page is an ISR/SSG route by checking the route manifest.
 */
function isIsrSsgRoute(pathname: string): boolean {
  // Early parameterization to get the cache key
  const parameterizedPath = maybeParameterizeRoute(pathname);
  const pathToCheck = parameterizedPath || pathname;

  // Check cache using the parameterized path as the key
  if (IS_ISR_SSG_ROUTE_CACHE.has(pathToCheck)) {
    return IS_ISR_SSG_ROUTE_CACHE.get(pathToCheck) as boolean;
  }

  // Cache miss get the manifest
  const manifest = getManifest();
  if (!manifest?.isrRoutes || !Array.isArray(manifest.isrRoutes) || manifest.isrRoutes.length === 0) {
    IS_ISR_SSG_ROUTE_CACHE.set(pathToCheck, false);
    return false;
  }

  const isIsrSsgRoute = manifest.isrRoutes.includes(pathToCheck);
  IS_ISR_SSG_ROUTE_CACHE.set(pathToCheck, isIsrSsgRoute);

  return isIsrSsgRoute;
}

/**
 * Remove sentry-trace and baggage meta tags from the DOM if this is an ISR/SSG page.
 * This prevents the browser tracing integration from using stale/cached trace IDs.
 */
export function removeIsrSsgTraceMetaTags(): void {
  if (!WINDOW.document || !isIsrSsgRoute(WINDOW.location.pathname)) {
    return;
  }

  // Helper function to remove a meta tag
  function removeMetaTag(metaName: string): void {
    try {
      const meta = WINDOW.document.querySelector(`meta[name="${metaName}"]`);
      if (meta) {
        meta.remove();
      }
    } catch {
      // ignore errors when removing the meta tag
    }
  }

  // Remove the meta tags so browserTracingIntegration won't pick them up
  removeMetaTag('sentry-trace');
  removeMetaTag('baggage');
}
