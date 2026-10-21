import { basename, dirname, isAbsolute } from 'node:path';
import { createIdResolver, type ResolvedConfig } from 'vite';
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

// Re-exports everything the generated code uses, and adds the Next.js span handling and OpenTelemetry context.
const NEXTJS_CLOUDFLARE_MODULE = '@sentry/nextjs/cloudflare';

/**
 * Whether `@sentry/nextjs/cloudflare` resolves from `importer`. Vite throws instead of returning `null` when
 * `@sentry/nextjs` is installed in a version without that entry.
 */
async function resolvesNextjsCloudflare(resolver: ModuleResolver, importer: string): Promise<boolean> {
  try {
    return !!(await resolver.resolve?.(NEXTJS_CLOUDFLARE_MODULE, importer));
  } catch {
    return false;
  }
}

type TransformContext = ModuleResolver & {
  warn?(msg: string): void;
  environment?: Parameters<ReturnType<typeof createIdResolver>>[0];
};

export function sentryCloudflareAutoInstrumentPlugin(options: { wranglerConfigPath?: string } = {}) {
  let wranglerConfig: WranglerConfig | undefined;
  let entryFilePath: string | undefined;
  // A `main` that is not a file path (a package export or virtual module).
  let entrySpecifier: string | undefined;
  let wranglerConfigPath: string | undefined;
  let resolveId: ReturnType<typeof createIdResolver> | undefined;
  // Each environment resolves with its own conditions, so the entry may differ between them.
  const resolvedEntries = new Map<string, Promise<string | undefined>>();

  let instrumentFilePath: string | undefined;
  let isVinext = false;

  function resolveEntrySpecifier(ctx: TransformContext, specifier: string): Promise<string | undefined> {
    const environment = ctx.environment;
    if (!environment || !resolveId) return Promise.resolve(undefined);

    let entry = resolvedEntries.get(environment.name);
    if (!entry) {
      // Resolved from the wrangler config, as wrangler does. Without an importer, Vite's resolver
      // tries the specifier as a path below the root first.
      entry = resolveId(environment, specifier, wranglerConfigPath)
        .catch(() => undefined)
        .then(id => {
          if (!id) {
            ctx.warn?.(
              `[sentry] Could not resolve the wrangler \`main\` "${specifier}". Auto-instrumentation disabled.`,
            );
            return undefined;
          }
          return normalizePath(id.replace(/[?#].*$/, ''));
        });
      resolvedEntries.set(environment.name, entry);
    }
    return entry;
  }

  return {
    name: 'sentry-cloudflare-auto-instrument',

    configResolved(config: {
      root: string;
      plugins?: readonly { name?: string }[];
      logger?: { warn(msg: string): void };
    }): void {
      isVinext = config.plugins?.some(plugin => plugin.name?.startsWith('vinext:')) ?? false;

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
      const main = wranglerConfig.main;
      if (main && isAbsolute(main)) {
        // Normalize separators so the entry-module comparison holds on Windows.
        entryFilePath = normalizePath(main);
        instrumentFilePath = resolveInstrumentFile(dirname(main));
      } else if (main) {
        entrySpecifier = main;
        wranglerConfigPath = result.configPath;
        // Not `this.resolve()`: Rollup's commonjs resolver loads the module it resolves, so a
        // resolve of the entry from the entry's own `transform` never finishes.
        resolveId = createIdResolver(config as ResolvedConfig);
        // A package entry has no project directory of its own.
        instrumentFilePath = resolveInstrumentFile(result.configDir);
      }
    },

    async transform(
      this: TransformContext,
      code: string,
      id: string,
    ): Promise<{ code: string; map: unknown } | undefined> {
      if (!wranglerConfig || (!entryFilePath && !entrySpecifier)) return undefined;

      // The worker entry never belongs to the client (browser) environment.
      // Skipping it keeps a same-basename sibling (e.g. a `src/index.tsx`
      // client entry next to a `src/index.ts` worker) out of the browser bundle.
      if (this.environment?.name === 'client') return undefined;

      const entryPath = entrySpecifier ? await resolveEntrySpecifier(this, entrySpecifier) : entryFilePath;
      if (!entryPath) return undefined;

      // Vite may append query/hash params to the module ID.
      const normalizedId = normalizePath(id.replace(/[?#].*$/, ''));
      if (normalizedId !== entryPath) {
        // Tolerate a differing JS-flavored extension (e.g. `.js` vs `.ts`).
        if (!JS_EXTENSION_REGEX.test(normalizedId) || !JS_EXTENSION_REGEX.test(entryPath)) return undefined;
        if (normalizedId.replace(JS_EXTENSION_REGEX, '') !== entryPath.replace(JS_EXTENSION_REGEX, '')) {
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

      // A vinext app with `@sentry/nextjs` installed gets `withSentry` of `@sentry/nextjs/cloudflare`.
      const sentryModule =
        isVinext && (await resolvesNextjsCloudflare(this, normalizedId)) ? NEXTJS_CLOUDFLARE_MODULE : undefined;

      const { optionsFn, importStmt: optionsImport } = instrumentFilePath
        ? buildOptionsImport(entryPath, instrumentFilePath)
        : { optionsFn: ENV_FALLBACK_OPTIONS_FN, importStmt: undefined };

      // No registration import is injected here: the orchestrion plugin's
      // subscribe-injection makes each bundled package self-register its channel
      // subscriber on the global marker, so wrapping the entry with `withSentry`
      // is all this plugin needs to do.
      const result = applyAutoInstrumentTransforms(code, ast, {
        classWrappers,
        agentClasses,
        optionsFn,
        optionsImport,
        sameWorkerBindings: wranglerConfig.sameWorkerBindings,
        sentryModule,
      });

      const wrappedClasses = result?.wrappedClasses ?? new Set<string>();
      const missing = [...classWrappers.keys()].filter(name => !wrappedClasses.has(name));
      if (missing.length > 0) {
        this.warn?.(
          `[sentry] Could not auto-instrument ${missing.join(', ')}.` +
            'The worker entry has no export matching them. ' +
            'Star re-exports (`export * from "./do"`) are not matched. ' +
            'Export them by name or wrap them manually with corresponding `instrument*WithSentry` helpers.',
        );
      }

      return result ?? undefined;
    },
  };
}
