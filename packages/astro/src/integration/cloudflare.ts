import type { AstroConfig } from 'astro';
import { builtinModules } from 'module';

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

/**
 * Module ids that carry the Worker's default-export handler, across the adapter majors we support.
 *
 * `@astrojs/cloudflare` v13+ builds the Worker through `@cloudflare/vite-plugin`, whose entry module
 * this is; its generated body ends with `export default mod.default ?? {};`. v12 had no such
 * dependency and built the Worker straight from Astro's own SSR entry
 * (https://github.com/withastro/astro/blob/09bbdbb1e62c388eb405eeea03554c15e01f2957/packages/integrations/cloudflare/src/entrypoints/server.ts#L23),
 * an id Astro no longer produces.
 */
const WORKER_ENTRY_MODULE_IDS = ['virtual:cloudflare/worker-entry', 'astrojs-ssr-virtual-entry'];

/**
 * Environments that never produce the deployed Worker: the browser bundle, and the separate Worker
 * Astro runs at build time to prerender routes. Both share the entry module id above.
 */
const SKIPPED_ENVIRONMENTS = ['client', 'prerender'];

const DEFAULT_EXPORT_IDENTIFIER = '__SENTRY_DEFAULT_EXPORT__';

interface DefaultExportRange {
  /** Bounds of the whole `export default …;` statement. */
  start: number;
  end: number;
  /** Bounds of the exported expression alone. */
  expressionStart: number;
  expressionEnd: number;
}

interface TransformContext {
  environment?: { name?: string };
  parse?(code: string): { body: Array<Record<string, unknown>> };
}

/**
 * A Vite plugin that wraps the Cloudflare Worker's default export handler with `@sentry/cloudflare`'s
 * `withSentry`, giving the Worker entry:
 * - `setAsyncLocalStorageAsyncContextStrategy()` for proper async context
 * - Per-request isolation scopes via `wrapRequestHandler`
 * - Trace context propagation
 *
 * This runs at the fetch boundary, so it covers every request. The `injectScript('page-ssr', ...)`
 * import alone would not: it is evaluated lazily during a page render, so an API route, an action,
 * or an error on the first request can be missed entirely.
 */
export function sentryCloudflareVitePlugin(): VitePlugin {
  return {
    name: 'sentry-astro-cloudflare',
    enforce: 'post',

    transform(code, id) {
      if (!WORKER_ENTRY_MODULE_IDS.some(entryId => id.includes(entryId))) {
        return undefined;
      }

      // Astro bundles its own Vite, so the plugin context is typed by whichever major is installed.
      const ctx = this as unknown as TransformContext;

      const environmentName = ctx.environment?.name;
      if (environmentName && SKIPPED_ENVIRONMENTS.includes(environmentName)) {
        return undefined;
      }

      const defaultExport = findDefaultExport(ctx, code);
      if (!defaultExport) {
        return undefined;
      }

      const handler = code.slice(defaultExport.expressionStart, defaultExport.expressionEnd);
      const transformedCode = [
        "import { withSentry } from '@sentry/cloudflare';",
        code.slice(0, defaultExport.start),
        `const ${DEFAULT_EXPORT_IDENTIFIER} = ${handler};`,
        `export default withSentry(() => undefined, ${DEFAULT_EXPORT_IDENTIFIER});`,
        code.slice(defaultExport.end),
      ].join('\n');

      return { code: transformedCode, map: null };
    },
  };
}

/**
 * Locate the `export default` statement and the expression it exports.
 *
 * The expression is read from the AST rather than matched textually, because its shape differs per
 * adapter major, a bare identifier in v12 and `mod.default ?? {}` in the module `@cloudflare/vite-plugin`
 * generates, and neither is guaranteed to stay as it is.
 */
function findDefaultExport(ctx: TransformContext, code: string): DefaultExportRange | undefined {
  let body;
  try {
    body = ctx.parse?.(code).body;
  } catch {
    // A module we cannot parse is one we cannot safely rewrite.
    return undefined;
  }

  for (const node of body ?? []) {
    if (node.type !== 'ExportDefaultDeclaration') {
      continue;
    }

    const declaration = node.declaration as { start?: number; end?: number } | undefined;
    if (typeof node.start !== 'number' || typeof node.end !== 'number') {
      return undefined;
    }
    if (typeof declaration?.start !== 'number' || typeof declaration.end !== 'number') {
      return undefined;
    }

    return {
      start: node.start,
      end: node.end,
      expressionStart: declaration.start,
      expressionEnd: declaration.end,
    };
  }

  return undefined;
}
