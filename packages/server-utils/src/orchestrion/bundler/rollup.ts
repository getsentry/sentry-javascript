import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import type { ExternalOption, InputOptions, NormalizedInputOptions, Plugin, PluginContext } from 'rollup';

export type { Plugin as RollupPlugin } from 'rollup';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';
import { resolveOrchestrionRuntimeRequest, SNIPPET_IMPORT_SPECIFIER } from './resolve';

/**
 * Whether a raw (un-normalized) `external` input option marks `name` as
 * external. String entries use the shared subpath-aware matching so a
 * `'mysql/lib/...'` entry flags `mysql`, consistent with the esbuild and
 * webpack plugins.
 */
function rawExternalMatchesModule(external: ExternalOption, name: string): boolean {
  if (typeof external === 'function') {
    return !!external(name, undefined, false);
  }
  const entries = Array.isArray(external) ? external : [external];
  return entries.some(entry =>
    typeof entry === 'string' ? externalEntryMatchesModule(entry, name) : entry.test(name),
  );
}

/**
 * Rollup plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Rollup. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): Plugin {
  if (options.buildTimeInstrumentation === false) {
    // Inert plugin — no code transform, so no instrumentation lands in the bundle.
    return { name: 'sentry-orchestrion-disabled' };
  }

  const moduleNames = instrumentedModuleNames(options.instrumentations);

  // Rolldown omits `external` from the normalized options passed to
  // `buildStart` (function-typed options don't cross its Rust/JS boundary —
  // rolldown/rolldown#1041), so capture the raw value for the probe below.
  let rawExternal: ExternalOption | undefined;

  return {
    ...codeTransformer(orchestrionTransformOptions(options)),
    options(inputOptions: InputOptions): null {
      rawExternal = inputOptions.external;
      return null;
    },
    // The module-injected snippet imports `@sentry/server-utils` from INSIDE
    // transformed `node_modules` files. Under isolated installs (pnpm) that bare
    // specifier doesn't resolve from an instrumented package's location, so when
    // normal resolution fails, fall back to this package's own resolution so it
    // gets bundled from its real on-disk path.
    async resolveId(this: PluginContext, source: string, importer: string | undefined) {
      if (source !== SNIPPET_IMPORT_SPECIFIER) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved) {
        return resolved;
      }
      return resolveOrchestrionRuntimeRequest(source) ?? null;
    },
    buildStart(this: PluginContext, rollupOptions: NormalizedInputOptions): void {
      // An externalized dependency never passes through the code transform, so
      // its diagnostics_channel calls are silently never injected. Rollup has
      // normalized `external` into a single predicate by the time buildStart
      // runs; Rolldown doesn't provide it here at all, so probe the raw value
      // captured in the `options` hook instead.
      const externalizedModules = moduleNames.filter(name =>
        typeof rollupOptions.external === 'function'
          ? rollupOptions.external(name, undefined, false)
          : rawExternal != null && rawExternalMatchesModule(rawExternal, name),
      );
      if (externalizedModules.length > 0) {
        this.warn(externalizedModulesWarning(externalizedModules));
      }
    },
  };
}
