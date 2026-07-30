import { basename } from 'node:path';
import { collectAgentCandidates, detectAgentClasses, type ModuleResolver } from './agentClass';
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

export function sentryCloudflareAutoInstrumentPlugin(options: { wranglerConfigPath?: string } = {}) {
  let wranglerConfig: WranglerConfig | undefined;
  let entryFilePath: string | undefined;

  let optionsFn = ENV_FALLBACK_OPTIONS_FN;
  let optionsImport: string | undefined;

  return {
    name: 'sentry-cloudflare-auto-instrument',

    configResolved(config: { root: string; logger?: { warn(msg: string): void } }): void {
      const result = resolveWranglerConfig(config.root, options.wranglerConfigPath);
      if (!result) {
        // An explicit path that fails is a misconfiguration worth naming;
        // without one, hint at the option so custom-named configs (e.g. a
        // `configPath` handed to @cloudflare/vite-plugin) are discoverable.
        config.logger?.warn(
          options.wranglerConfigPath
            ? `[sentry] Could not find or parse the wrangler config "${basename(options.wranglerConfigPath)}" ` +
                '(resolved against the Vite root) — auto-instrumentation disabled.'
            : '[sentry] No parseable wrangler config found — auto-instrumentation disabled. ' +
                'Set `wranglerConfigPath` if your config uses a custom name.',
        );
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

    async transform(
      this: ModuleResolver & { warn?(msg: string): void; environment?: { name?: string } },
      code: string,
      id: string,
    ): Promise<{ code: string; map: unknown } | undefined> {
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

      // An `agents` Agent is a Durable Object, so wrangler lists it among the DO bindings and only
      // its base-class chain tells the two apart. Detection walks the module graph (base classes
      // usually live in their own file), so it is limited to the configured DO classes.
      //
      // Only `resolve` is handed over — never `load`: awaiting `load()` from inside a transform
      // hook deadlocks the build, since the module can't finish loading while this transform is
      // still pending. `agentClass` reads sibling modules off disk instead.
      const agentCandidates = collectAgentCandidates(
        ast,
        [...classWrappers].filter(([, kind]) => kind === 'durableObject').map(([name]) => name),
      );
      const agentClasses =
        agentCandidates.size > 0
          ? await detectAgentClasses(ast, normalizedId, agentCandidates, {
              parse: code => this.parse(code),
              resolve: this.resolve ? (source, importer) => this.resolve!(source, importer) : undefined,
            })
          : undefined;

      // No registration import is injected here: the orchestrion plugin's
      // subscribe-injection makes each bundled package self-register its channel
      // subscriber on the global marker, so wrapping the entry with `withSentry`
      // is all this plugin needs to do.
      const result = applyAutoInstrumentTransforms(code, ast, {
        classWrappers,
        agentClasses,
        optionsFn,
        optionsImport,
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
