import { buildOptionsImport, ENV_FALLBACK_OPTIONS_FN, resolveInstrumentFile } from './instrumentFile';
import { applyAutoInstrumentTransforms, type ClassWrapperKind, type ProgramBody } from './transform';
import { resolveWranglerConfig, type WranglerConfig } from './wranglerConfig';

// Vite normalizes module IDs to posix separators even on Windows, while
// `path.resolve` yields backslashes there — normalize before comparing.
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

// Extensions the entry-module match may tolerate swapping (e.g. wrangler's
// `main` says `.ts` but the served module is `.js`). Anything else — `.css`,
// `.html`, … — sharing the entry's basename must never be treated as the entry.
const JS_EXTENSION_REGEX = /\.[cm]?[jt]sx?$/;

/**
 * Options for {@link sentryCloudflareAutoInstrumentPlugin}.
 */
interface SentryCloudflareAutoInstrumentPluginOptions {
  /**
   * Inject the Sentry namespace import from the `@sentry/cloudflare/nodejs_compat`
   * entry instead of `@sentry/cloudflare`. Set when diagnostics-channel injection
   * is active: that setup already requires the `nodejs_compat` compatibility flag
   * at runtime, and the matching entry exposes the full feature set (e.g. the
   * channel-based `vercelAIIntegration`, `prismaIntegration`).
   */
  useNodejsCompatEntry?: boolean;
}

export function sentryCloudflareAutoInstrumentPlugin(options: SentryCloudflareAutoInstrumentPluginOptions = {}) {
  const sentryImportSpecifier = options.useNodejsCompatEntry
    ? '@sentry/cloudflare/nodejs_compat'
    : '@sentry/cloudflare';
  let wranglerConfig: WranglerConfig | undefined;
  let entryFilePath: string | undefined;

  let optionsFn = ENV_FALLBACK_OPTIONS_FN;
  let optionsImport: string | undefined;

  return {
    name: 'sentry-cloudflare-auto-instrument',

    configResolved(config: { root: string; logger?: { warn(msg: string): void } }): void {
      const result = resolveWranglerConfig(config.root);
      if (!result) {
        config.logger?.warn('[sentry] No parseable wrangler config found — auto-instrumentation disabled.');
        return;
      }

      wranglerConfig = result.config;
      if (wranglerConfig.main) {
        // `main` is already absolute (wrangler resolves it); just normalize
        // separators so the entry-module comparison holds on Windows.
        entryFilePath = normalizePath(wranglerConfig.main);
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

      const classWrappers = new Map<string, ClassWrapperKind>();
      for (const { className } of wranglerConfig.durableObjects) {
        classWrappers.set(className, 'durableObject');
      }
      for (const { className } of wranglerConfig.workflows) {
        classWrappers.set(className, 'workflow');
      }
      for (const className of wranglerConfig.workerEntrypoints) {
        classWrappers.set(className, 'workerEntrypoint');
      }

      // No registration import is injected here: the orchestrion plugin's
      // subscribe-injection makes each bundled package self-register its channel
      // subscriber on the global marker, so wrapping the entry with `withSentry`
      // is all this plugin needs to do.
      const result = applyAutoInstrumentTransforms(code, ast, {
        classWrappers,
        optionsFn,
        optionsImport,
        sentryImportSpecifier,
      });

      const wrappedClasses = result?.wrappedClasses ?? new Set<string>();
      const missing = [...classWrappers.keys()].filter(name => !wrappedClasses.has(name));
      if (missing.length > 0) {
        this.warn?.(
          `[sentry] Could not auto-instrument class(es) ${missing.join(', ')}: no matching exported class ` +
            'declaration found in the worker entry (re-exports from other modules cannot be wrapped ' +
            'automatically). Wrap them manually with the matching `instrument*WithSentry` helper.',
        );
      }

      return result ?? undefined;
    },
  };
}
