import { resolve } from 'node:path';
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
  warn(message: string): void;
}

/** The plugin shape `sentryCloudflareVitePlugin` composes. */
export interface ProvidedModulePlugin {
  name: string;
  applyToEnvironment(environment: { config: { consumer: string } }): boolean;
  configResolved(config: { root: string }): void;
  buildStart(this: ResolveContext): Promise<void>;
  transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined;
}

export interface ProvidedModulePluginOptions {
  /** Vite plugin name, e.g. `sentry-cloudflare-mastra-observability-provider`. */
  name: string;
  /** Bare specifier of the package to provide, e.g. `@mastra/observability`. */
  moduleName: string;
  /** Namespace binding the injected import uses, e.g. `__SENTRY_MASTRA_OBSERVABILITY__`. */
  identifier: string;
  /** Basename of the `@sentry/server-utils` integration module to inject into, e.g. `mastra`. */
  integrationModule: string;
}

/**
 * Build the matcher for one `@sentry/server-utils` integration module.
 *
 * Plain `endsWith`, not a `RegExp`: nothing here needs pattern matching, and building one from
 * a caller-supplied string would need escaping, which is the only reason this file would have to
 * import from `@sentry/core`. A build-time plugin should not drag the SDK into the build.
 */
export function createIntegrationModuleMatcher(integrationModule: string): (id: string) => boolean {
  // The ESM build only: a worker never loads the CJS one.
  const suffix = `@sentry/server-utils/build/esm/integrations/${integrationModule}.js`;

  return (id: string): boolean =>
    id
      .replace(/\\/g, '/')
      .replace(/[?#].*$/, '')
      .endsWith(suffix);
}

function buildProviderSnippet({ moduleName, identifier }: ProvidedModulePluginOptions): string {
  const marker = 'globalThis.__SENTRY_ORCHESTRION__';

  // A getter: Sentry's module can evaluate before the provided package has initialized.
  return (
    `import * as ${identifier} from '${moduleName}';\n` +
    `(${marker} = ${marker} || {});\n` +
    `(${marker}.providedModules = ${marker}.providedModules || {});\n` +
    `Object.defineProperty(${marker}.providedModules, '${moduleName}', ` +
    `{ configurable: true, enumerable: true, get() { return ${identifier}; } });\n`
  );
}

/**
 * Build a Vite plugin that hands a package to one of Sentry's integration modules in a bundled
 * worker, which has no `node_modules` to resolve it from. For Mastra, this prepends roughly the
 * following to `@sentry/server-utils/build/esm/integrations/mastra.js`:
 *
 * ```js
 * import * as __SENTRY_MASTRA_OBSERVABILITY__ from '@mastra/observability';
 * globalThis.__SENTRY_ORCHESTRION__.providedModules['@mastra/observability'] = __SENTRY_MASTRA_OBSERVABILITY__; // as a getter
 * ```
 *
 * Only for packages the app doesn't import itself: this import is what brings them into the bundle.
 * A package the app loads anyway publishes itself instead (`selfProvidedModules`), which adds no
 * edge to Sentry's module and so can't close a cycle.
 */
export function createProvidedModulePlugin(options: ProvidedModulePluginOptions): ProvidedModulePlugin {
  const isIntegrationModuleId = createIntegrationModuleMatcher(options.integrationModule);

  let root = process.cwd();
  let providerSnippet: string | undefined;

  return {
    name: options.name,

    applyToEnvironment(environment: { config: { consumer: string } }): boolean {
      // Server environments only. `buildStart` runs per environment against one shared plugin
      // instance, so without this a `client` build resolves first, under browser conditions, and
      // answers on the worker's behalf. That defeats the point of probing with `this.resolve`.
      // Same gate the orchestrion plugin uses.
      return environment.config.consumer === 'server';
    },

    configResolved(config: { root: string }): void {
      root = config.root;
    },

    async buildStart(this: ResolveContext): Promise<void> {
      // Already answered by an earlier server environment. A build with several worker
      // environments shares the answer: they resolve under the same conditions.
      if (providerSnippet) return;

      try {
        // The environment's own resolver, so the probe uses the conditions the injected import
        // will. That is what a `require.resolve` probe cannot do: an ESM-only package has no
        // `require` condition and reads as missing. Resolved from the app root, not from Sentry's
        // own install.
        const resolved = await this.resolve(options.moduleName, resolve(root, 'noop.js'));
        if (!resolved) return;
      } catch (error) {
        // Present but unresolvable for some other reason. Inject anyway so the build fails loudly
        // rather than silently shipping a worker with no instrumentation, and surface the original
        // cause: the import error Vite raises next says nothing about why resolution broke.
        this.warn(
          `[Sentry] could not resolve ${options.moduleName} while probing for it; injecting the provider anyway. ${
            (error as Error | undefined)?.message ?? error
          }`,
        );
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
