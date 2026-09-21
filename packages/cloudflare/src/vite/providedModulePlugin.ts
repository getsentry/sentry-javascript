import { resolve } from 'node:path';
import { escapeStringForRegex } from '@sentry/core';
import MagicString from 'magic-string';

/**
 * The slice of the Rollup plugin context the probe needs. Declared here rather than imported so
 * this file carries no Rollup or Vite type dependency.
 */
interface ResolveContext {
  resolve(
    source: string,
    importer?: string,
    options?: { skipSelf?: boolean },
  ): Promise<{ id: string; external?: boolean | string } | null>;
}

/** The plugin shape `sentryCloudflareVitePlugin` composes. */
export interface ProvidedModulePlugin {
  name: string;
  configResolved(config: { root: string }): void;
  buildStart(this: ResolveContext): Promise<void>;
  transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined;
}

export interface ProvidedModulePluginOptions {
  /** Vite plugin name, e.g. `sentry-cloudflare-flue-runtime-provider`. */
  name: string;
  /** Bare specifier of the package to provide, e.g. `@flue/runtime`. */
  moduleName: string;
  /** Namespace binding the injected import uses, e.g. `__SENTRY_FLUE_RUNTIME__`. */
  identifier: string;
  /** Basename of the `@sentry/server-utils` integration module to inject into, e.g. `flue`. */
  integrationModule: string;
}

/** Build the matcher for one `@sentry/server-utils` integration module. */
export function createIntegrationModuleMatcher(integrationModule: string): (id: string) => boolean {
  // The ESM build only: a worker never loads the CJS one.
  const pattern = new RegExp(
    `@sentry/server-utils/build/esm/integrations/${escapeStringForRegex(integrationModule)}\\.js$`,
  );

  return (id: string): boolean => pattern.test(id.replace(/\\/g, '/').replace(/[?#].*$/, ''));
}

function buildProviderSnippet({ moduleName, identifier }: ProvidedModulePluginOptions): string {
  const marker = 'globalThis.__SENTRY_ORCHESTRION__';

  // A getter, not an assignment: assigning reads the binding at injection time, so it stores
  // `undefined` whenever the bundler evaluates Sentry's module before the provided package
  // finished initializing. Enumerable so the entry shows up in `Object.keys` and a spread.
  return (
    `import * as ${identifier} from '${moduleName}';\n` +
    `(${marker} = ${marker} || {});\n` +
    `(${marker}.providedModules = ${marker}.providedModules || {});\n` +
    `Object.defineProperty(${marker}.providedModules, '${moduleName}', ` +
    `{ configurable: true, enumerable: true, get() { return ${identifier}; } });\n`
  );
}

/**
 * Build a Vite plugin that splices a static `import * as … from '<moduleName>'` into one of
 * Sentry's own integration modules and exposes the namespace on the global orchestrion marker.
 *
 * Some packages are instrumented by registration rather than by patching, so instrumenting them
 * needs a reference to that module's own binding and no channel payload carries one. On Node the
 * integration resolves it itself; a bundled worker has no `node_modules` to resolve from, so the
 * binding is supplied at build time instead. The import is static, lands in Sentry's module rather
 * than the user's code, and is only emitted when the package actually resolves.
 */
export function createProvidedModulePlugin(options: ProvidedModulePluginOptions): ProvidedModulePlugin {
  const isIntegrationModuleId = createIntegrationModuleMatcher(options.integrationModule);

  let root = process.cwd();
  let providerSnippet: string | undefined;

  return {
    name: options.name,

    configResolved(config: { root: string }): void {
      root = config.root;
    },

    async buildStart(this: ResolveContext): Promise<void> {
      // Already answered by an earlier environment. Resolution is per environment, and only the
      // worker one ever reaches `transform`, so the first package found stands for the build.
      if (providerSnippet) return;

      try {
        // The environment's own resolver, so the probe uses the conditions the injected import
        // will. That is what a `require.resolve` probe cannot do: an ESM-only package has no
        // `require` condition and reads as missing. Resolved from the app root, not from Sentry's
        // own install.
        const resolved = await this.resolve(options.moduleName, resolve(root, 'noop.js'));
        if (!resolved) return;
      } catch {
        // Installed but unresolvable for some other reason. Inject anyway so the build reports it,
        // rather than silently shipping a worker with no instrumentation.
      }

      providerSnippet = buildProviderSnippet(options);
    },

    transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined {
      // `code.includes` keeps this idempotent: a second pass over already-injected output would
      // otherwise emit a duplicate `import * as` binding, which is a syntax error.
      if (!providerSnippet || !isIntegrationModuleId(id) || code.includes(options.identifier)) return undefined;

      const ms = new MagicString(code);
      ms.prepend(providerSnippet);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}
