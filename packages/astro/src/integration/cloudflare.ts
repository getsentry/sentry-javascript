import { builtinModules } from 'module';
import type { Plugin } from 'vite';

// Build a set of all Node.js built-in module names, including both
// bare names (e.g. "fs") and "node:" prefixed names (e.g. "node:fs").
const NODE_BUILTINS = new Set(builtinModules.flatMap(m => [m, `node:${m}`]));

/**
 * A Vite plugin that suppresses the "Automatically externalized node built-in module"
 * warnings that Vite emits when bundling for Cloudflare Workers.
 *
 * These warnings are expected because `@sentry/astro` re-exports `@sentry/node` on the
 * server side, and `@sentry/node` (plus OpenTelemetry) import many Node.js built-in
 * modules. Vite correctly externalizes them, but warns about it. These warnings are
 * harmless since Cloudflare Workers support Node.js built-ins under the `node:` prefix.
 */
export function sentryCloudflareNodeWarningPlugin(): Plugin {
  return {
    name: 'sentry-astro-cloudflare-suppress-node-warnings',
    enforce: 'pre',

    config() {
      return {
        ssr: {
          // Explicitly mark all Node.js built-in modules as external.
          // This prevents Vite from emitting "Automatically externalized" warnings
          // for each one during the SSR/Worker build.
          external: [...NODE_BUILTINS],
        },
      };
    },
  };
}

/**
 * A Vite plugin that ensures the Sentry server config is loaded at the
 * top level of the Cloudflare Worker entry module, rather than only being
 * injected into SSR page modules via `injectScript('page-ssr', ...)`.
 *
 * Without this, Astro actions and API routes never call `Sentry.init()`,
 * because `injectScript('page-ssr')` only adds the import to page components.
 *
 * Additionally, this plugin wraps the Worker's default export handler with
 * `@sentry/cloudflare`'s `withSentry` to provide:
 * - `setAsyncLocalStorageAsyncContextStrategy()` for proper async context
 * - Per-request isolation scopes via `wrapRequestHandler`
 * - Trace context propagation
 */
export function sentryCloudflareVitePlugin(): Plugin {
  return {
    name: 'sentry-astro-cloudflare',
    enforce: 'post',

    transform(code, id) {
      // Match the Astro SSR virtual entry — this becomes dist/_worker.js/index.js
      // The resolved virtual module ID is `\0@astrojs-ssr-virtual-entry`
      if (!id.includes('astrojs-ssr-virtual-entry')) {
        return undefined;
      }

      // In @astrojs/cloudflare v12, the virtual entry module structure is:
      // https://github.com/withastro/astro/blob/09bbdbb1e62c388eb405eeea03554c15e01f2957/packages/integrations/cloudflare/src/entrypoints/server.ts#L23
      // We need to wrap `default` with `withSentry` before it's exported.
      const defaultExportMatch = code.match(/export\s+default\s+([\w.]+)\s*;/);

      if (!defaultExportMatch) {
        return undefined;
      }

      const originalExpr = defaultExportMatch[1];
      const wrappedExport = `export default withSentry(() => undefined, ${originalExpr});`;
      const transformedCode = [
        "import { withSentry } from '@sentry/cloudflare';",
        code.replace(defaultExportMatch[0], wrappedExport),
      ].join('\n');

      return { code: transformedCode, map: null };
    },
  };
}
