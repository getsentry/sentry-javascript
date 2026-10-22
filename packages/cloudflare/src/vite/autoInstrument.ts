import { basename, dirname, isAbsolute } from 'node:path';
import { createCallSiteRewriter, type ModuleParser, parseModule } from '@sentry/bundler-plugins/rewriter';
import { createIdResolver, type ResolvedConfig } from 'vite';
import { collectAgentCandidates, detectAgentClasses, type ModuleResolver } from './agentClass';
import { buildOptionsImport, ENV_FALLBACK_OPTIONS_FN, resolveInstrumentFile } from './instrumentFile';
import { applyAutoInstrumentTransforms, type BaseNode, type ClassWrapperKind, type ProgramBody } from './transform';
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

// `@cloudflare/vite-plugin` loads the Worker from this module. `resolveId` prefixes it with `\0`.
const CLOUDFLARE_WORKER_ENTRY_ID = 'virtual:cloudflare/worker-entry';

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

function isCloudflareWorkerEntry(id: string): boolean {
  const bare = (id.charCodeAt(0) === 0 ? id.slice(1) : id).replace(/[?#].*$/, '');
  return bare === CLOUDFLARE_WORKER_ENTRY_ID;
}

/**
 * Exported names of the `export { A, B } from "..."` statements other plugins append to the
 * worker-entry facade, such as vinext's Workers Cache response stages. `default` is the user entry,
 * which the entry transform wraps.
 */
function appendedNamedReexports(ast: ProgramBody): string[] {
  const names: string[] = [];
  for (const node of ast.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const { source, specifiers } = node as BaseNode & {
      source?: { value?: unknown } | null;
      specifiers?: Array<{ exported?: { name?: string } }>;
    };
    if (typeof source?.value !== 'string') continue;
    for (const specifier of specifiers ?? []) {
      const exported = specifier.exported?.name;
      if (exported && exported !== 'default') names.push(exported);
    }
  }
  return names;
}

/**
 * Whether the module re-exports everything from another module of its own file, as the shim
 * `@sentry/tanstackstart-react` loads for the server entry does (`export * from "<entry>?sentry-tunnel-original"`).
 * That module is transformed as the entry too, and its classes are wrapped there.
 */
function reexportsAllFromSameFile(ast: ProgramBody, normalizedId: string): boolean {
  return ast.body.some(node => {
    if (node.type !== 'ExportAllDeclaration') return false;
    const { exported, source } = node as BaseNode & { exported?: unknown; source?: { value?: unknown } };
    const value = source?.value;
    return !exported && typeof value === 'string' && normalizePath(value.replace(/[?#].*$/, '')) === normalizedId;
  });
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
  // Per environment, the ID of a virtual module another plugin serves as `main`.
  const virtualEntries = new Map<string, string>();

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
        .then(id => (id ? normalizePath(id.replace(/[?#].*$/, '')) : undefined));
      resolvedEntries.set(environment.name, entry);
    }
    return entry;
  }

  async function instrumentFacadeEntrypoints(
    ctx: TransformContext,
    code: string,
  ): Promise<{ code: string; map: unknown } | undefined> {
    let ast: ProgramBody;
    try {
      ast = ctx.parse(code);
    } catch {
      return undefined;
    }

    const names = appendedNamedReexports(ast);
    if (names.length === 0) return undefined;

    // A virtual module has no directory. Resolve options and `@sentry/nextjs/cloudflare` from a real file.
    const importer = entryFilePath ?? wranglerConfigPath;
    if (!importer) return undefined;

    const sentryModule =
      isVinext && (await resolvesNextjsCloudflare(ctx, importer)) ? NEXTJS_CLOUDFLARE_MODULE : undefined;
    const { optionsFn, importStmt: optionsImport } = instrumentFilePath
      ? buildOptionsImport(importer, instrumentFilePath, { absolute: true })
      : { optionsFn: ENV_FALLBACK_OPTIONS_FN, importStmt: undefined };

    // Adapters build some entrypoints with a factory, which no static check can see. `withSentry`
    // checks at run time whether the value extends `WorkerEntrypoint`, and returns any other value,
    // such as a Durable Object, unchanged.
    const classWrappers = new Map<string, ClassWrapperKind>(names.map(name => [name, 'workerEntrypoint']));
    return (
      applyAutoInstrumentTransforms(code, ast, {
        classWrappers,
        optionsFn,
        optionsImport,
        sentryModule,
        wrapDefault: false,
      }) ?? undefined
    );
  }

  return {
    name: 'sentry-cloudflare-auto-instrument',
    // vinext appends its Workers Cache entrypoints to the worker-entry module in a normal transform.
    // Running after all normal plugins makes them visible here in any plugin order.
    enforce: 'post' as const,
    // Without it, `vite dev` calls `buildStart` only for the client environment, which this plugin skips.
    perEnvironmentStartEndDuringDev: true,

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

    async buildStart(this: Omit<TransformContext, 'parse'>): Promise<void> {
      const environment = this.environment;
      if (!entrySpecifier || !environment || environment.name === 'client') return;

      if (await resolveEntrySpecifier(this as TransformContext, entrySpecifier)) return;

      // Vite's own resolver does not see virtual modules other plugins serve, such as Solid's
      // `virtual:solid-ssr-handler`. The plugin pipeline does, and here, unlike in `transform`, it can't wait
      // on the entry's own transform.
      const resolved = await this.resolve?.(entrySpecifier, wranglerConfigPath ?? '').catch(() => undefined);
      if (resolved) {
        virtualEntries.set(environment.name, normalizePath(resolved.id.replace(/[?#].*$/, '')));
        return;
      }

      this.warn?.(
        `[sentry] Could not resolve the wrangler \`main\` "${entrySpecifier}". Auto-instrumentation disabled.`,
      );
    },

    async transform(
      this: TransformContext,
      code: string,
      id: string,
    ): Promise<{ code: string; map: unknown } | undefined> {
      const config = wranglerConfig;
      if (!config || (!entryFilePath && !entrySpecifier)) return undefined;

      // The worker entry never belongs to the client (browser) environment.
      // Skipping it keeps a same-basename sibling (e.g. a `src/index.tsx`
      // client entry next to a `src/index.ts` worker) out of the browser bundle.
      if (this.environment?.name === 'client') return undefined;

      // Named entrypoints appended to this facade are invoked through `ctx.exports` and never run
      // the wrapped default export, so `Sentry.init` does not run in that invocation.
      if (isCloudflareWorkerEntry(id)) {
        return instrumentFacadeEntrypoints(this, code);
      }

      const virtualEntry = this.environment && virtualEntries.get(this.environment.name);
      const entryPath =
        virtualEntry ?? (entrySpecifier ? await resolveEntrySpecifier(this, entrySpecifier) : entryFilePath);
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

      // `this.parse` fails on raw TypeScript, which oxc parses.
      const parse: ModuleParser = (source, moduleId) => {
        try {
          return this.parse(source);
        } catch {
          return parseModule(source, moduleId);
        }
      };

      const output = await createCallSiteRewriter(
        [
          {
            name: 'cloudflare-worker-entry',
            include: {},
            apply: async ({ ast, state }) => {
              const classWrappers = new Map<string, ClassWrapperKind>();
              for (const { className } of config.durableObjects) {
                classWrappers.set(className, 'durableObject');
              }
              for (const { className } of config.workflows) {
                classWrappers.set(className, 'workflow');
              }
              for (const className of config.workerEntrypoints) {
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
                      resolve: this.resolve?.bind(this),
                    })
                  : undefined;

              // A vinext app with `@sentry/nextjs` installed gets `withSentry` of `@sentry/nextjs/cloudflare`.
              const sentryModule =
                isVinext && (await resolvesNextjsCloudflare(this, normalizedId)) ? NEXTJS_CLOUDFLARE_MODULE : undefined;

              const { optionsFn, importStmt: optionsImport } = instrumentFilePath
                ? // A virtual module has no directory to import from relatively.
                  buildOptionsImport(entryPath, instrumentFilePath, { absolute: !!virtualEntry })
                : { optionsFn: ENV_FALLBACK_OPTIONS_FN, importStmt: undefined };

              // The TanStack Start server entry shim with a release wraps the default export of the entry it re-exports
              // (`export default addReleaseMetaTag(serverEntry, release)`). That entry is wrapped already, and a second
              // `withSentry` would start a second trace for each request.
              const reexportsEntry = reexportsAllFromSameFile(ast, normalizedId);

              // No registration import is injected here: the orchestrion plugin's
              // subscribe-injection makes each bundled package self-register its channel
              // subscriber on the global marker, so wrapping the entry with `withSentry`
              // is all this plugin needs to do.
              const result = applyAutoInstrumentTransforms(
                code,
                ast,
                {
                  classWrappers,
                  agentClasses,
                  optionsFn,
                  optionsImport,
                  sameWorkerBindings: config.sameWorkerBindings,
                  sentryModule,
                  workerInfo: { name: config.name, compatibilityDate: config.compatibilityDate },
                  wrapDefault: !reexportsEntry,
                },
                state,
              );

              const wrappedClasses = result?.wrappedClasses ?? new Set<string>();
              const missing = [...classWrappers.keys()].filter(name => !wrappedClasses.has(name));
              if (missing.length > 0 && !reexportsEntry) {
                this.warn?.(
                  `[sentry] Could not auto-instrument ${missing.join(', ')}. ` +
                    'The worker entry has no export matching them. ' +
                    'Star re-exports (`export * from "./do"`) are not matched. ' +
                    'Export them by name or wrap them manually with corresponding `instrument*WithSentry` helpers.',
                );
              }
            },
          },
        ],
        { parse },
      ).transform(code, normalizedId);

      return output ?? undefined;
    },
  };
}
