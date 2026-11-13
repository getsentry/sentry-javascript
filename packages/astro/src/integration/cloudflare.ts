import type { AstroConfig } from 'astro';
import { builtinModules } from 'module';
import { SERVER_INIT_IMPORT } from './serverInit';

// Derived from Astro's own config type rather than imported from `vite` directly: Astro bundles its
// own Vite version, which differs across the Astro majors we support. A plugin typed against any
// single Vite version is not assignable to `updateConfig({ vite: { plugins } })` for the others.
export type VitePlugin = Extract<NonNullable<NonNullable<AstroConfig['vite']>['plugins']>[number], { name: string }>;

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
export function sentryCloudflareNodeWarningPlugin(): VitePlugin {
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

// The Worker entry module: `@astrojs/cloudflare` v12 builds its own virtual entry, and v13+ builds
// through `@cloudflare/vite-plugin`, whose entry ends in `export default mod.default ?? {};`.
export const WORKER_ENTRY_IDS = ['astrojs-ssr-virtual-entry', 'virtual:cloudflare/worker-entry'];

/**
 * A Vite plugin that wraps the Worker's default export handler with `@sentry/cloudflare`'s `withSentry` to provide:
 * - `setAsyncLocalStorageAsyncContextStrategy()` for proper async context
 * - Per-request isolation scopes via `wrapRequestHandler`
 * - Trace context propagation
 *
 * With `importServerInit`, it also imports the server init at the top of the Worker entry. The wrap inits a client
 * from the Wrangler bindings on each request, and the isolate keeps the first client it gets. So the user's
 * `Sentry.init()` has to run before that, or it gets back the bindings-only client and its options are ignored.
 * This also runs the init for actions and API routes, which `injectScript('page-ssr')` doesn't reach.
 */
export function sentryCloudflareVitePlugin({ importServerInit = false } = {}): VitePlugin {
  return {
    name: 'sentry-astro-cloudflare',
    enforce: 'post',

    transform(code, id) {
      if (!WORKER_ENTRY_IDS.some(entryId => id.includes(entryId))) {
        return undefined;
      }

      // In @astrojs/cloudflare v12, the virtual entry module structure is:
      // https://github.com/withastro/astro/blob/09bbdbb1e62c388eb405eeea03554c15e01f2957/packages/integrations/cloudflare/src/entrypoints/server.ts#L23
      // We need to wrap `default` with `withSentry` before it's exported.
      const defaultExportMatch = code.match(/export\s+default\s+([^;]+?)\s*;/);

      if (!defaultExportMatch) {
        return undefined;
      }

      const originalExpr = defaultExportMatch[1];
      const wrappedExport = `export default withSentry(() => undefined, ${originalExpr});`;
      const transformedCode = [
        ...(importServerInit ? [SERVER_INIT_IMPORT.trim()] : []),
        "import { withSentry } from '@sentry/cloudflare';",
        code.replace(defaultExportMatch[0], wrappedExport),
      ].join('\n');

      return { code: transformedCode, map: null };
    },
  };
}
