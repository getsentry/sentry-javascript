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
 * whichever request comes first. With `injectIntoEntry`, a build also imports it from the server entry, so the SDK is
 * set up before the server takes its first request: a tunnel request from a prerendered page on a cold server renders
 * no SSR page and would otherwise reach the app before the runtime answers tunnel requests.
 */
export function makeServerInitVitePlugin(serverInitSnippet: string, { injectIntoEntry = false } = {}): VitePlugin {
  let isBuild = false;

  return {
    name: 'sentry-astro-server-init',
    configResolved: config => {
      isBuild = config.command === 'build';
    },
    resolveId: id => (id === SERVER_INIT_MODULE || id === SENTRY_MIDDLEWARE_MODULE ? `\0${id}` : null),
    load: id => {
      if (id === `\0${SERVER_INIT_MODULE}`) {
        return serverInitSnippet;
      }

      return id === `\0${SENTRY_MIDDLEWARE_MODULE}`
        ? `${SERVER_INIT_IMPORT}export { onRequest } from "@sentry/astro/middleware";\n`
        : null;
    },
    transform(code, id, options) {
      // The dev server's module graph has no server entry, and an import added to what it marks as one hangs it.
      if (!injectIntoEntry || !isBuild || !options?.ssr || !this.getModuleInfo(id)?.isEntry) {
        return null;
      }

      return { code: `${SERVER_INIT_IMPORT}${code}`, map: null };
    },
  };
}
