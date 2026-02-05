import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';
import type { AutoInstrumentRSCOptions } from './types';

const JS_EXTENSIONS_RE = /\.(ts|tsx|js|jsx|mjs|mts)$/;

/** Query parameter suffix used to load the original (unwrapped) module. */
const WRAPPED_MODULE_SUFFIX = '?sentry-rsc-wrap';

/**
 * Extracts a route path from a file path relative to the routes directory.
 *
 * Only supports filesystem-based nested directory routing
 * (e.g., `app/routes/rsc/page.tsx` -> `/rsc/page`).
 *
 * Limitations:
 * - Does not support React Router's dot-delimited flat file convention
 *   (e.g., `app/routes/rsc.page.tsx`).
 * - Does not read React Router's route config, so manually configured routes
 *   that differ from the filesystem path will produce incorrect `componentRoute` values.
 *
 * Exported for testing.
 */
export function filePathToRoute(filePath: string, routesDirectory: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedRoutesDir = routesDirectory.replace(/\\/g, '/');

  const withSlashes = `/${normalizedRoutesDir}/`;
  let routesDirIndex = normalizedPath.lastIndexOf(withSlashes);

  if (routesDirIndex !== -1) {
    routesDirIndex += 1;
  } else if (normalizedPath.startsWith(`${normalizedRoutesDir}/`)) {
    routesDirIndex = 0;
  } else {
    return '/';
  }

  let relativePath = normalizedPath.slice(routesDirIndex + normalizedRoutesDir.length);
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.slice(1);
  }

  relativePath = relativePath.replace(/\.(tsx?|jsx?|mjs|mts)$/, '');

  if (relativePath.endsWith('/index')) {
    relativePath = relativePath.slice(0, -6);
  } else if (relativePath === 'index') {
    relativePath = '';
  }

  // Convert React Router's `$param` convention to `:param` for route matching
  relativePath = relativePath.replace(/\$([^/]+)/g, ':$1');

  return `/${relativePath}`;
}

/** Checks for a `'use client'` directive at the start of the module (after comments/whitespace). */
function hasUseClientDirective(code: string): boolean {
  const stripped = code.replace(/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, '');
  return /^(['"])use client\1/.test(stripped);
}

/** Checks whether the file already contains a manual `wrapServerComponent` call. */
function hasManualWrapping(code: string): boolean {
  return code.includes('wrapServerComponent(');
}

/**
 * Naive check for `export default` — may match inside comments or strings.
 * Acceptable for this experimental scope; a false positive causes the wrapper
 * to import a non-existent default export, which produces a build error.
 */
function hasDefaultExport(code: string): boolean {
  return /export\s+default\s+/.test(code);
}

/**
 * Generates wrapper module code that re-exports the original component wrapped
 * with `wrapServerComponent` via the `?sentry-rsc-wrap` virtual module suffix.
 *
 * Exported for testing.
 */
export function getWrapperCode(originalId: string, componentRoute: string): string {
  const wrappedId = JSON.stringify(`${originalId}${WRAPPED_MODULE_SUFFIX}`);
  const wrapOptions = `{ componentRoute: ${JSON.stringify(componentRoute)}, componentType: 'Page' }`;
  // The interpolation prevents ESLint's `quotes` rule from flagging the template literal.
  return [
    `import { wrapServerComponent } from '${'@sentry/react-router'}';`,
    `import _SentryComponent from ${wrappedId};`,
    `export default wrapServerComponent(_SentryComponent, ${wrapOptions});`,
    `export * from ${wrappedId};`,
  ].join('');
}

/**
 * A Vite plugin that automatically instruments React Router RSC server components.
 *
 * Uses a virtual module pattern (similar to `@sentry/sveltekit`'s auto-instrumentation):
 * instead of rewriting exports with regex, the plugin intercepts route files in the `transform`
 * hook and replaces them with a thin wrapper module that imports the original file via a
 * `?sentry-rsc-wrap` query suffix, wraps the default export, and re-exports everything else.
 *
 * TODO: The `?sentry-rsc-wrap` suffix may appear in stack traces. Consider adding a
 * `rewriteFrames` integration rule to strip it for cleaner error reporting.
 *
 * @experimental This plugin is experimental and may change in minor releases.
 * React Router RSC support requires React Router v7.9.0+ with `unstable_reactRouterRSC()`.
 *
 * RSC mode is auto-detected via `configResolved` by checking for the `react-router/rsc`
 * Vite plugin. No explicit flag is needed — just use `sentryReactRouter({}, env)`.
 */
export function makeAutoInstrumentRSCPlugin(options: AutoInstrumentRSCOptions = {}): Plugin {
  const { enabled = true, debug = false }: AutoInstrumentRSCOptions = options;
  const normalizedRoutesDir = (options.routesDirectory ?? 'app/routes').replace(/\\/g, '/');

  let rscDetected = false;

  return {
    name: 'sentry-react-router-rsc-auto-instrument',
    enforce: 'pre',

    configResolved(config) {
      rscDetected = config.plugins.some(p => p.name.startsWith('react-router/rsc'));
      debug &&
        // eslint-disable-next-line no-console
        console.log(`[Sentry RSC] RSC mode ${rscDetected ? 'detected' : 'not detected'}`);
    },

    resolveId(source) {
      if (source.includes(WRAPPED_MODULE_SUFFIX)) {
        return source;
      }
      return null;
    },

    async load(id: string) {
      if (!id.includes(WRAPPED_MODULE_SUFFIX)) {
        return null;
      }
      const originalPath = id.slice(0, -WRAPPED_MODULE_SUFFIX.length);
      try {
        return await readFile(originalPath, 'utf-8');
      } catch {
        debug &&
          // eslint-disable-next-line no-console
          console.log(`[Sentry RSC] Failed to read original file: ${originalPath}`);
        return null;
      }
    },

    transform(code: string, id: string) {
      if (id.includes(WRAPPED_MODULE_SUFFIX)) {
        return null;
      }

      if (!enabled || !rscDetected || !JS_EXTENSIONS_RE.test(id)) {
        return null;
      }

      const normalizedId = id.replace(/\\/g, '/');

      if (!normalizedId.includes(`/${normalizedRoutesDir}/`) && !normalizedId.startsWith(`${normalizedRoutesDir}/`)) {
        return null;
      }

      if (hasUseClientDirective(code)) {
        debug &&
          // eslint-disable-next-line no-console
          console.log(`[Sentry RSC] Skipping client component: ${id}`);
        return null;
      }

      if (hasManualWrapping(code)) {
        debug &&
          // eslint-disable-next-line no-console
          console.log(`[Sentry RSC] Skipping already wrapped: ${id}`);
        return null;
      }

      if (!hasDefaultExport(code)) {
        debug &&
          // eslint-disable-next-line no-console
          console.log(`[Sentry RSC] Skipping no default export: ${id}`);
        return null;
      }

      const componentRoute = filePathToRoute(normalizedId, normalizedRoutesDir);

      debug &&
        // eslint-disable-next-line no-console
        console.log(`[Sentry RSC] Auto-wrapping server component: ${id} -> ${componentRoute}`);

      return { code: getWrapperCode(id, componentRoute), map: null };
    },
  };
}
