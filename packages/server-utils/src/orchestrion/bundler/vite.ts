// EXPERIMENTAL — Vite plugin that runs the orchestrion code transform at build
// time, injecting `diagnostics_channel.tracingChannel` calls into the libraries
// listed in `SENTRY_INSTRUMENTATIONS`.
//
// This file is published ESM-only via the `@sentry/server-utils/orchestrion/vite`
// subpath export. `@apm-js-collab/code-transformer-bundler-plugins` is
// `"type": "module"`, so consuming it from a CJS build is intentionally
// unsupported — vite.config.ts is almost always ESM in practice. The CJS
// rollup variant still emits this file, but `package.json` only exposes the
// ESM entry, so attempts to `require('@sentry/server-utils/orchestrion/vite')` will
// fail at resolution time rather than producing a half-broken plugin.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

import codeTransformerEsbuild from '@apm-js-collab/code-transformer-bundler-plugins/esbuild';
import codeTransformerRollup from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import MagicString from 'magic-string';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { INSTRUMENTED_MODULE_NAMES, SENTRY_INSTRUMENTATIONS } from '../config';

// `vite` types live in the package's ESM-only subpath; under Node16 module
// resolution with TS treating @sentry/server-utils as CJS, importing them produces a
// false positive. We don't need the runtime value for typing — `UnknownPlugin`
// is sufficient — so we omit the import entirely.

export interface SentryOrchestrionPluginOptions {
  /**
   * Whether to register the SDK's channel-subscriber integrations.
   *
   * When `true`, the plugin injects into the app's server entry a static import
   * that registers the channel-subscriber integrations on the global orchestrion
   * marker, where `getRegisteredChannelIntegrations()` picks them up. This is how
   * the subscriber integrations — which SDKs deliberately do not import so
   * bundlers can drop them — end up in the bundle exactly when this plugin
   * injects the channels they subscribe to. It also opts the dev server into
   * the same instrumentation (via the dep optimizer), so `vite dev` records
   * spans too.
   *
   * The registration is SDK-agnostic: the injected import targets
   * `@sentry/server-utils` (a transitive dependency of every SDK that uses this
   * plugin), so any bundled SDK — Cloudflare today, Nuxt/Nitro, SvelteKit, Node
   * SSR later — enables it the same way, with nothing to publish or wire up.
   *
   * Leave unset for SDKs that wire up the integrations through a static import
   * instead (e.g. `@sentry/node`'s `experimentalUseDiagnosticsChannelInjection()`),
   * which never read the marker.
   */
  registerIntegrations?: boolean;
}

/**
 * Vite plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Vite (e.g. Vite SSR builds, Nuxt's Nitro
 * pipeline, SvelteKit). For unbundled Node processes use the runtime hooks
 * instead (`@sentry/node`'s `experimentalUseDiagnosticsChannelInjection()`, or
 * `node --import @sentry/server-utils/orchestrion/import-hook app.js`).
 *
 * Both `vite build` and the `vite dev` server are instrumented, but by
 * different paths because the dev server never bundles:
 *   - In a build, Rollup runs the code transform over the bundled deps and the
 *     `renderChunk` marker/`transformedModules` banners are emitted normally.
 *   - In dev, deps are pre-bundled by the optimizer before the Vite transform
 *     sees them, so the transform is wired into the optimizer instead (esbuild
 *     on classic Vite, Rolldown on Vite 8); and since `renderChunk` never runs
 *     (and reading `getModuleInfo().isEntry` throws in the dev server), the
 *     registration import is injected structurally into the entry rather than
 *     via chunk metadata. Dev has no `transformedModules` list, so every
 *     registered integration is activated (idle subscribers for channels that
 *     never fire).
 *
 * Returns the following plugins:
 *   1. `sentry-orchestrion-marker` — a `renderChunk` hook that prepends a
 *      banner to entry chunks. The banner sets
 *      `globalThis.__SENTRY_ORCHESTRION__.bundler = true` at app boot, so the
 *      `_experimentalSetupOrchestrion()` detector can confirm the bundler path
 *      ran (rather than relying on a build-time flag that wouldn't be visible
 *      to the runtime).
 *      Also injects every instrumented package name into `ssr.noExternal` via
 *      the `config` hook, since externalized deps are `require()`d at runtime
 *      from `node_modules` and never pass through the transform. And it hooks
 *      the dep optimizer of non-client environments via `configEnvironment`, so
 *      dev-mode dependency pre-bundling (which bypasses the `transform` hook)
 *      also injects the channels.
 *   2. `sentry-orchestrion-register-integrations` (only with
 *      `options.registerIntegrations`) — injects the channel-integration
 *      registration import into the app's server entry and, in dev, wires the
 *      code transform into the optimizer, see
 *      {@link SentryOrchestrionPluginOptions.registerIntegrations}.
 *   3. The upstream `@apm-js-collab/code-transformer-bundler-plugins/vite`
 *      plugin, fed our central `SENTRY_INSTRUMENTATIONS` config.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(options: SentryOrchestrionPluginOptions = {}): UnknownPlugin[] {
  const codeTransformerPlugins = codeTransformer({
    instrumentations: SENTRY_INSTRUMENTATIONS,
    // Only the marker-based registration path (`registerIntegrations`) reads the
    // transformed-module list; the runtime `--import` path never does, so we
    // avoid emitting the banner when it wouldn't be consumed.
    ...(options.registerIntegrations ? { injectDiagnostics: makeTransformedModulesBanner() } : {}),
  });
  const codeTransformerArray: UnknownPlugin[] = Array.isArray(codeTransformerPlugins)
    ? codeTransformerPlugins
    : [codeTransformerPlugins];
  return [
    bundlerMarkerPlugin(),
    ...(options.registerIntegrations ? [registerIntegrationsPlugin()] : []),
    ...codeTransformerArray,
  ];
}

/**
 * Builds the `injectDiagnostics` callback for the code transformer: it records
 * the packages the transformer actually transformed — and those whose transform
 * failed — onto the global orchestrion marker, so
 * `getRegisteredChannelIntegrations()` can activate only the integrations whose
 * module made it into the bundle (e.g. skip the mysql subscriber in an app that
 * only bundles `postgres`).
 *
 * A failed transform also gets a build-time warning: the package IS in the
 * bundle but its diagnostics channels are not, so its integration is skipped
 * and spans silently go missing at runtime otherwise. The callback runs once
 * per emitted chunk, hence the once-guard on the warning.
 *
 * The transformer runs the callback at `renderChunk` and prepends the returned
 * string to each emitted chunk. That's exactly the phase that can't host a
 * bundled `import` (see {@link registerIntegrationsPlugin}), but a
 * self-contained assignment like this one is fine there — it needs nothing
 * from the module graph. Every chunk receives the same complete list (the
 * graph is fully transformed before any chunk renders), so the repeated
 * assignment is idempotent.
 */
function makeTransformedModulesBanner(): (diagnostics: {
  transformedModules: string[];
  failedModules: string[];
}) => string {
  let warnedFailedModules = false;
  return ({ transformedModules, failedModules }) => {
    if (failedModules.length && !warnedFailedModules) {
      warnedFailedModules = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] The orchestrion code transform failed for: ${failedModules.join(', ')}. ` +
          'These packages are bundled without diagnostics channels, so Sentry will not record spans for them.',
      );
    }
    return (
      'globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{};' +
      `globalThis.__SENTRY_ORCHESTRION__.transformedModules=${JSON.stringify(transformedModules)};` +
      `globalThis.__SENTRY_ORCHESTRION__.failedModules=${JSON.stringify(failedModules)};\n`
    );
  };
}

// The virtual registration module the plugin injects also acts as the sentinel
// which prevents duplicate injection.
const REGISTER_MODULE_ID = 'virtual:@sentry/orchestrion-register-integrations';
const RESOLVED_REGISTER_MODULE_ID = `\0${REGISTER_MODULE_ID}`;

/**
 * Injects, into the app's server entry, a static import that registers the
 * channel-subscriber integrations on the global orchestrion marker (where the
 * SDK's `getRegisteredChannelIntegrations()` reads them).
 *
 * Two things make this work where the obvious approaches don't:
 *
 *   - The import is added in the `transform` (module-graph) phase, NOT via the
 *     code transformer's `injectDiagnostics` hook. That hook runs at
 *     `renderChunk`, after the graph is bundled, so a bare import it adds is
 *     never bundled and workerd throws `No such module` at runtime.
 *
 *   - The virtual module imports an absolute ESM path computed at plugin init
 *     (via `createRequire`, from the plugin's own package). The entry it's
 *     injected into can itself be a virtual module (e.g.
 *     `@cloudflare/vite-plugin`'s `virtual:cloudflare/worker-entry`) with no base
 *     directory, and the worker environment's resolver won't resolve a bare
 *     specifier from there. Resolving the ESM build explicitly also avoids
 *     pulling a second, CommonJS copy of `@sentry/core` into the worker bundle.
 *
 * This registers every integration's factory (still can't tree-shake unused
 * subscriber code out of the bundle — that needs a module-graph-phase hook
 * upstream). In a build, which ones actually get instantiated at runtime is
 * narrowed by `getRegisteredChannelIntegrations()` against the
 * `transformedModules` list that {@link makeTransformedModulesBanner} emits via
 * `injectDiagnostics`; in dev there is no such list, so every registered
 * integration is activated.
 *
 * Entry detection differs by mode, because the dev server never bundles:
 *   - Build: inject into the entry module, found via Rollup's
 *     `ModuleInfo.isEntry`.
 *   - Dev (`vite dev`): `renderChunk` never runs and reading
 *     `getModuleInfo().isEntry` *throws* (`The "isEntry" property of ModuleInfo
 *     is not supported`), so instead inject into the first server-environment
 *     source module transformed — the module runner requests the worker entry
 *     first, so that is the entry (and any earlier-loaded startup module would
 *     work equally well, since registration only has to run before requests).
 *
 * In dev the instrumented deps are pre-bundled by the optimizer (esbuild)
 * before the Vite transform pipeline can see their source, so the
 * `configEnvironment` hook also wires the code transform into the optimizer's
 * esbuild pass — without it, `vite dev` would register the subscribers but the
 * channels they listen on would never be injected into the deps.
 */
function registerIntegrationsPlugin(): UnknownPlugin {
  // `createRequire().resolve(REGISTER_MODULE)` would select the package's CJS
  // export. Resolve the package root instead and explicitly target the ESM
  // export which is bundled alongside the ESM-only Vite plugin.
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(require.resolve('@sentry/server-utils/package.json'));
  const resolvedRegisterModule = resolve(packageRoot, 'build/esm/orchestrion/index.js');

  // The slices of Vite's environment-API / Rollup plugin context we read; typed
  // structurally since we don't import `vite`/`rollup` types here (see note at
  // the top of the file).
  interface PluginContext {
    environment?: { name?: string; config?: { consumer?: string } };
    getModuleInfo?: (id: string) => { isEntry?: boolean } | null;
  }

  // `serve` (vite dev) vs `build`; drives entry detection in `transform`.
  let command = 'build';
  // Dev only: environments the registration import has already been injected
  // into, so each is injected exactly once (into its first source module).
  const injectedServeEnvironments = new Set<string>();

  function injectRegisterImport(code: string): { code: string; map: unknown } | null {
    if (code.includes(REGISTER_MODULE_ID)) return null;
    const ms = new MagicString(code);
    const injection = `import ${JSON.stringify(REGISTER_MODULE_ID)};\n`;
    const shebangEnd = code.startsWith('#!') ? code.indexOf('\n') : -1;
    if (code.startsWith('#!') && shebangEnd === -1) {
      ms.append(`\n${injection}`);
    } else {
      ms.appendLeft(shebangEnd + 1, injection);
    }
    return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
  }

  return {
    name: 'sentry-orchestrion-register-integrations',
    configResolved(config: { command: string }): void {
      command = config.command;
    },
    resolveId(id: string): string | null {
      return id === REGISTER_MODULE_ID ? RESOLVED_REGISTER_MODULE_ID : null;
    },
    load(id: string): { code: string; moduleSideEffects: boolean } | null {
      if (id !== RESOLVED_REGISTER_MODULE_ID) return null;
      // Keep this generated rather than moving the side effect into a published
      // entry point: a future allow-list can emit only the requested factory
      // imports here and let Rollup tree-shake the rest of the ESM module.
      return {
        code: [
          `import { registerChannelIntegrations } from ${JSON.stringify(resolvedRegisterModule)};`,
          'registerChannelIntegrations();',
          '',
        ].join('\n'),
        moduleSideEffects: true,
      };
    },
    transform(this: PluginContext | undefined, code: string, id: string): { code: string; map: unknown } | null {
      // Client bundles must never pull in a server SDK's integrations; without
      // environment info (classic non-environment-API Vite) assume server.
      if (this?.environment?.config?.consumer === 'client') return null;

      if (command === 'build') {
        // Inject into the app entry only. It must be the first module request so
        // registration runs before an entry body or a re-exported worker module
        // can initialize Sentry.
        if (!this?.getModuleInfo?.(id)?.isEntry) return null;
        return injectRegisterImport(code);
      }

      // Dev (`vite dev`): reading `getModuleInfo().isEntry` *throws* in the dev
      // server (`The "isEntry" property of ModuleInfo is not supported`), so
      // detect the entry as the first source module transformed per server
      // environment — the module runner requests the worker entry first. Skip
      // pre-bundled deps, node_modules source, and virtual modules so the import
      // lands in the user's entry, not an incidental early module.
      const environment = this?.environment?.name ?? '';
      if (injectedServeEnvironments.has(environment)) return null;
      const cleanId = id.split('?')[0] ?? id;
      if (
        id.startsWith('\0') ||
        cleanId.includes('/node_modules/') ||
        cleanId.includes('/.vite/') ||
        !/\.[cm]?[jt]sx?$/.test(cleanId)
      ) {
        return null;
      }
      const result = injectRegisterImport(code);
      if (result) injectedServeEnvironments.add(environment);
      return result;
    },
  };
}

function bundlerMarkerPlugin(): UnknownPlugin {
  const banner = [
    'globalThis.__SENTRY_ORCHESTRION__ = (globalThis.__SENTRY_ORCHESTRION__ || {});',
    'globalThis.__SENTRY_ORCHESTRION__.bundler = true;',
    '',
  ].join('\n');

  return {
    name: 'sentry-orchestrion-marker',
    enforce: 'pre' as const,
    config(): { ssr: { noExternal: string[] } } {
      // Force-bundle every instrumented package so the code transform actually
      // sees its source. Vite externalizes dependencies in SSR builds by
      // default, leaving them as bare `require()`/`import` calls resolved from
      // `node_modules` at runtime — those copies are untouched and the
      // diagnostics_channel calls never get injected. Vite merges array
      // `noExternal` entries with the user's config, so we don't overwrite
      // their additions.
      return { ssr: { noExternal: INSTRUMENTED_MODULE_NAMES } };
    },
    configEnvironment(this: { meta?: { rolldownVersion?: string } } | undefined, name: string): unknown {
      if (name === 'client') return undefined;
      // In dev, environments that pre-bundle their dependencies (e.g.
      // `@cloudflare/vite-plugin` worker environments set
      // `optimizeDeps.noDiscovery: false`) load instrumented packages through
      // the dep optimizer, which bypasses the `transform` hook above — the
      // channels would silently never be injected in `vite dev`. Register the
      // code transformer with the optimizer too; it returns null for everything
      // but the instrumented files, so it composes with Vite's loader.
      // Environments without dep optimization ignore this.
      //
      // Vite 8 pre-bundles deps with Rolldown (which takes Rollup-style plugins
      // via `optimizeDeps.rolldownOptions` and deprecates `esbuildOptions`);
      // earlier Vite uses esbuild. Detect via the Rolldown-only
      // `meta.rolldownVersion` and feed the matching transformer flavor.
      if (this?.meta?.rolldownVersion) {
        return {
          optimizeDeps: {
            rolldownOptions: {
              plugins: [codeTransformerRollup({ instrumentations: SENTRY_INSTRUMENTATIONS })],
            },
          },
        };
      }
      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [codeTransformerEsbuild({ instrumentations: SENTRY_INSTRUMENTATIONS })],
          },
        },
      };
    },
    renderChunk(code: string, chunk: { isEntry: boolean }): { code: string; map: unknown } | null {
      if (!chunk.isEntry) return null;
      // Prepend via magic-string so the entry chunk's sourcemap stays aligned —
      // returning `map: null` here would shift every mapping by the banner's
      // line count and misattribute server stack traces.
      const ms = new MagicString(code);
      ms.prepend(banner);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}
