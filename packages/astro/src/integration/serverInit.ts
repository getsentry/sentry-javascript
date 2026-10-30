import type { VitePlugin } from './cloudflare';

const SERVER_INIT_MODULE = 'virtual:@sentry/astro/server-init';

/**
 * The middleware entrypoint the integration registers instead of `@sentry/astro/middleware` when it injects the init.
 */
export const SENTRY_MIDDLEWARE_MODULE = 'virtual:@sentry/astro/middleware';

/**
 * The `page-ssr` script that runs the server init.
 */
export const SERVER_INIT_IMPORT = `import "${SERVER_INIT_MODULE}";\n`;

/**
 * Serves the server init as one module that SSR pages and the Sentry middleware both import, so it runs once, on
 * whichever request comes first. With only the `page-ssr` script, a request that renders no SSR page, like a tunnel
 * request from a prerendered page on a cold server, would find no client.
 */
export function makeServerInitVitePlugin(serverInitSnippet: string): VitePlugin {
  return {
    name: 'sentry-astro-server-init',
    resolveId: id => (id === SERVER_INIT_MODULE || id === SENTRY_MIDDLEWARE_MODULE ? `\0${id}` : null),
    load: id => {
      if (id === `\0${SERVER_INIT_MODULE}`) {
        return serverInitSnippet;
      }

      return id === `\0${SENTRY_MIDDLEWARE_MODULE}`
        ? `${SERVER_INIT_IMPORT}export { onRequest } from "@sentry/astro/middleware";\n`
        : null;
    },
  };
}
