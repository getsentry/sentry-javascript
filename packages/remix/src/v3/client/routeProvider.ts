import { type CachedRouteProvider, createCachedRouteProvider } from '@sentry/browser';

/**
 * The route provider for Remix 3.
 *
 * The browser has no route table: `remix/component` never matches routes client side. The server
 * reports the matched pattern on each HTML response instead, and the tracing integration records it
 * here as documents and frames arrive. A URL the app has not loaded yet resolves to nothing.
 */
export function createRemixV3RouteProvider(): CachedRouteProvider {
  return createCachedRouteProvider();
}
