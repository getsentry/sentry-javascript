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
export function sentryCloudflareVitePlugin(serverConfigPath: string): Plugin {
  return {
    name: 'sentry-astro-cloudflare',
    enforce: 'post',

    transform(code, id) {
      // Match the Astro SSR virtual entry — this becomes dist/_worker.js/index.js
      // The resolved virtual module ID is `\0@astrojs-ssr-virtual-entry`
      if (!id.includes('astrojs-ssr-virtual-entry')) {
        return undefined;
      }

      // The virtual entry module ends with something like:
      //   export default _exports.default;
      // where `_exports.default` is `{ fetch }` — a Cloudflare ExportedHandler.
      //
      // We need to:
      // 1. Add the sentry server config import at the top (so Sentry.init() runs at worker startup)
      // 2. Wrap the default export with `withSentry` from @sentry/cloudflare

      const sentryImports = [
        `import ${JSON.stringify(serverConfigPath)};`,
        "import { withSentry as __sentryWithSentry, getClient as __sentryGetClient } from '@sentry/cloudflare';",
      ].join('\n');

      // The optionsCallback for withSentry extracts options from the client
      // that was already initialized by the user's sentry.server.config.js import.
      const optionsCallback = `(env) => {
    const client = __sentryGetClient();
    return client ? client.getOptions() : {};
  }`;

      // Pattern 1: `export default _exports.default;` or `export default someVar;`
      // Note: [\w.]+ to match property access like `_exports.default`
      const defaultExportMatch = code.match(/export\s+default\s+([\w.]+)\s*;/);
      if (defaultExportMatch) {
        const originalExpr = defaultExportMatch[1];

        const wrappedExport = `export default __sentryWithSentry(${optionsCallback}, ${originalExpr});`;

        const transformedCode = `${sentryImports}\n${code.replace(defaultExportMatch[0], wrappedExport)}`;

        return { code: transformedCode, map: null };
      }

      // Pattern 2: `export { varName as default, pageMap }`
      // This pattern appears after Rollup bundling transforms the exports
      const namedExportMatch = code.match(/export\s*\{\s*(\w+)\s+as\s+default\s*(,\s*[^}]*)?\s*\}/);
      if (namedExportMatch) {
        const originalVar = namedExportMatch[1];
        const restExports = namedExportMatch[2] || '';

        const wrappedExport = `const __sentryWrappedHandler = __sentryWithSentry(${optionsCallback}, ${originalVar});
export { __sentryWrappedHandler as default${restExports} }`;

        const transformedCode = `${sentryImports}\n${code.replace(namedExportMatch[0], wrappedExport)}`;

        return { code: transformedCode, map: null };
      }

      // Fallback: just prepend the server config import so at least Sentry.init() runs
      return { code: `${sentryImports}\n${code}`, map: null };
    },
  };
}
