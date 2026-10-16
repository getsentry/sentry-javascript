import type { VitePlugin } from '../cloudflare';

/**
 * The middleware entrypoint the integration registers instead of `@sentry/astro/middleware`.
 */
export const SENTRY_MIDDLEWARE_MODULE = 'virtual:@sentry/astro/middleware';
const RESOLVED_SENTRY_MIDDLEWARE_MODULE = `\0${SENTRY_MIDDLEWARE_MODULE}`;

/**
 * Serves the Sentry middleware behind the server init. `page-ssr` scripts only run once an SSR page loads, so without
 * this a request that renders no page, like a tunnel request on a cold serverless instance, would find no client.
 */
export function makeSentryMiddlewareVitePlugin(serverInitSnippet: string): VitePlugin {
  return {
    name: 'sentry-astro-middleware',
    resolveId: id => (id === SENTRY_MIDDLEWARE_MODULE ? RESOLVED_SENTRY_MIDDLEWARE_MODULE : null),
    load: id =>
      id === RESOLVED_SENTRY_MIDDLEWARE_MODULE
        ? `${serverInitSnippet}\nexport { onRequest } from "@sentry/astro/middleware";\n`
        : null,
  };
}
