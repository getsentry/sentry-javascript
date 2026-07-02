import { resolve } from 'node:path';
import { buildOptionsImport, ENV_FALLBACK_OPTIONS_FN, resolveInstrumentFile } from './instrumentFile';
import { applyAutoInstrumentTransforms, type ProgramBody } from './transform';
import { resolveWranglerConfig, type WranglerConfig } from './wranglerConfig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

export interface SentryCloudflareAutoInstrumentOptions {
  /**
   * Path to the wrangler configuration file, resolved against the Vite project
   * root. Auto-detected when omitted (tries `wrangler.json`, `wrangler.jsonc`,
   * `wrangler.toml` in order — the same precedence wrangler applies).
   */
  wranglerConfigPath?: string;
}

// Vite normalizes module IDs to posix separators even on Windows, while
// `path.resolve` yields backslashes there — normalize before comparing.
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

// Extensions the entry-module match may tolerate swapping (e.g. wrangler's
// `main` says `.ts` but the served module is `.js`). Anything else — `.css`,
// `.html`, … — sharing the entry's basename must never be treated as the entry.
const JS_EXTENSION_REGEX = /\.[cm]?[jt]sx?$/;

// The orchestrion bundler marker is normally prepended to entry chunks in
// `renderChunk`, which only runs at build time. Prepending it to the worker
// entry here as well makes `vite dev` — where the channels are injected during
// dep pre-bundling instead — register the channel subscribers too. Setting the
// flag twice in a build is harmless.
const ORCHESTRION_MARKER_BANNER =
  'globalThis.__SENTRY_ORCHESTRION__ = (globalThis.__SENTRY_ORCHESTRION__ || {});\n' +
  'globalThis.__SENTRY_ORCHESTRION__.bundler = true;\n';

export function sentryCloudflareAutoInstrumentPlugin(
  pluginOptions: SentryCloudflareAutoInstrumentOptions = {},
): UnknownPlugin {
  let wranglerConfig: WranglerConfig | undefined;
  let entryFilePath: string | undefined;

  let optionsFn = ENV_FALLBACK_OPTIONS_FN;
  let optionsImport: string | undefined;

  return {
    name: 'sentry-cloudflare-auto-instrument',

    configResolved(config: { root: string; logger?: { warn(msg: string): void } }): void {
      const result = resolveWranglerConfig(config.root, pluginOptions.wranglerConfigPath);
      if (!result) {
        config.logger?.warn('[sentry] No parseable wrangler config found — auto-instrumentation disabled.');
        return;
      }

      wranglerConfig = result.config;
      if (wranglerConfig.main) {
        entryFilePath = normalizePath(resolve(result.configDir, wranglerConfig.main));
      }

      if (entryFilePath) {
        const instrumentFilePath = resolveInstrumentFile(entryFilePath);
        if (instrumentFilePath) {
          const built = buildOptionsImport(entryFilePath, instrumentFilePath);
          optionsFn = built.optionsFn;
          optionsImport = built.importStmt;
        }
      }
    },

    transform(
      this: { parse(code: string): ProgramBody; warn?(msg: string): void; environment?: { name?: string } },
      code: string,
      id: string,
    ): { code: string; map: unknown } | undefined {
      if (!wranglerConfig || !entryFilePath) return undefined;

      // The worker entry never belongs to the client (browser) environment.
      // Skipping it keeps a same-basename sibling (e.g. a `src/index.tsx`
      // client entry next to a `src/index.ts` worker) out of the browser bundle.
      if (this.environment?.name === 'client') return undefined;

      // Vite may append query/hash params to the module ID.
      const normalizedId = normalizePath(id.replace(/[?#].*$/, ''));
      if (normalizedId !== entryFilePath) {
        // Tolerate a differing JS-flavored extension (e.g. `.js` vs `.ts`).
        if (!JS_EXTENSION_REGEX.test(normalizedId) || !JS_EXTENSION_REGEX.test(entryFilePath)) return undefined;
        if (normalizedId.replace(JS_EXTENSION_REGEX, '') !== entryFilePath.replace(JS_EXTENSION_REGEX, '')) {
          return undefined;
        }
      }

      let ast: ProgramBody;
      try {
        ast = this.parse(code);
      } catch {
        // Raw TypeScript or syntax error — esbuild hasn't run yet (unlikely)
        // or the file is genuinely broken.  Either way, skip silently.
        return undefined;
      }

      const doClassNames = new Set(wranglerConfig.durableObjects.map(d => d.className));
      const result = applyAutoInstrumentTransforms(code, ast, {
        doClassNames,
        optionsFn,
        optionsImport,
        prependBanner: ORCHESTRION_MARKER_BANNER,
      });

      const wrappedDoClasses = result?.wrappedDoClasses ?? new Set<string>();
      const missing = [...doClassNames].filter(name => !wrappedDoClasses.has(name));
      if (missing.length > 0) {
        this.warn?.(
          `[sentry] Could not auto-instrument Durable Object class(es) ${missing.join(', ')}: no matching ` +
            'exported class declaration found in the worker entry (re-exports from other modules cannot be ' +
            'wrapped automatically). Wrap them manually with `instrumentDurableObjectWithSentry`.',
        );
      }

      return result ?? undefined;
    },
  };
}
