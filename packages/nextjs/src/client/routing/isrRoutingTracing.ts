import type { RouteManifest } from '../../config/manifest/types';
import { maybeParameterizeRoute } from './parameterization';
import { GLOBAL_OBJ } from '@sentry/core';

const globalWithInjectedValues = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRouteManifest: string | RouteManifest;
};

/**
 * Check if the current page is an ISR/SSG route by checking the route manifest.
 */
function isIsrSsgRoute(pathname: string): boolean {
  const manifestData = globalWithInjectedValues._sentryRouteManifest;
  if (!manifestData) {
    return false;
  }

  let manifest: RouteManifest;
  if (typeof manifestData === 'string') {
    try {
      manifest = JSON.parse(manifestData);
    } catch {
      return false;
    }
  } else {
    manifest = manifestData;
  }

  if (!manifest.isrRoutes || manifest.isrRoutes.length === 0) {
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
  if (typeof document === 'undefined') {
    return;
  }

  if (!isIsrSsgRoute(window.location.pathname)) {
    return;
  }

  // Remove the meta tags so browserTracingIntegration won't pick them up
  const sentryTraceMeta = document.querySelector('meta[name="sentry-trace"]');
  if (sentryTraceMeta) {
    sentryTraceMeta.remove();
  }

  const baggageMeta = document.querySelector('meta[name="baggage"]');
  if (baggageMeta) {
    baggageMeta.remove();
  }
}
