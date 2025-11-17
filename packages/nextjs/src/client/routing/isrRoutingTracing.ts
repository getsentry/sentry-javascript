import { WINDOW } from '@sentry/react';
import type { RouteManifest } from '../../config/manifest/types';
import { maybeParameterizeRoute } from './parameterization';

const globalWithInjectedValues = WINDOW as typeof WINDOW & {
  _sentryRouteManifest: string;
};

/**
 * Check if the current page is an ISR/SSG route by checking the route manifest.
 */
function isIsrSsgRoute(pathname: string): boolean {
  const manifestData = globalWithInjectedValues._sentryRouteManifest;
  if (!manifestData || typeof manifestData !== 'string') {
    return false;
  }

  let manifest: RouteManifest;
  try {
    manifest = JSON.parse(manifestData);
  } catch {
    return false;
  }

  if (!manifest.isrRoutes || !Array.isArray(manifest.isrRoutes) || manifest.isrRoutes.length === 0) {
    return false;
  }

  const parameterizedPath = maybeParameterizeRoute(pathname);
  const pathToCheck = parameterizedPath || pathname;

  return manifest.isrRoutes.includes(pathToCheck);
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
