import { isBuiltin } from 'node:module';

import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import type {
  ExternalOption,
  InputOptions,
  NormalizedInputOptions,
  Plugin,
  PluginContext,
  ResolveIdHook,
} from 'rollup';

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
 * Structural subset of `@rollup/plugin-commonjs` options, so this package needs no dependency on
 * the plugin for its types.
 */
export interface CommonJSInteropOptions {
  requireReturnsDefault: (id: string) => boolean | 'auto' | 'preferred' | 'namespace';
  ignoreTryCatch: (id: string) => boolean;
}

// External CommonJS dependencies of the force-inlined drivers whose `require()` must unwrap to
// `module.exports`, because the driver calls or constructs the result (`new mquery()`, `ms(val)`)
// or the plugin rewrites a plain-member `.default` read into a direct read of the require proxy
// (ioredis' `exports.defaults = lodash_defaults_1.default`). The `'auto'` mode never unwraps on
// Node >= 23: a CommonJS namespace now carries a `'module.exports'` key next to `default`
// (nodejs/node#53848), so the driver receives the namespace object and crashes.
//
// Unwrapping everything is no alternative. A call-position `.default` read (ioredis'
// `(0, debug_1.default)(...)`) survives the rewrite and needs the `'auto'` namespace, so `debug`
// must stay off this list. The list goes stale when a driver gains a new dependency of the first
// kind. The symptom is "x is not a constructor" or "x is not a function" on Node >= 23, at server
// startup or on first connect.
const UNWRAPPED_DRIVER_DEPENDENCIES = new Set([
  // mongoose
  'kareem',
  'mpath',
  'mquery',
  'ms',
  'sift',
  // ioredis
  '@ioredis/commands',
  'cluster-key-slot',
  'denque',
  'lodash.defaults',
  'lodash.isarguments',
  // mysql
  'bignumber.js',
  'sqlstring',
]);

/**
 * `@rollup/plugin-commonjs` options for builds that force-inline the instrumented CommonJS
 * packages (Nitro-based frameworks: Nuxt, SolidStart) while those packages' own CommonJS
 * dependencies stay external.
 *
 * `requireReturnsDefault` restores `require()` semantics on Node >= 23 for builtins and the
 * dependencies in {@link UNWRAPPED_DRIVER_DEPENDENCIES}. Everything else keeps the plugin's
 * `'auto'` behavior.
 *
 * `ignoreTryCatch` converts builtin `require()`s inside `try` blocks, which the plugin leaves
 * untouched by default. A bare `require` throws in Nitro's ESM output (mongodb lazily requires
 * `crypto` for SCRAM-SHA-1 auth). Non-builtins stay untouched so optional-dependency probes
 * still behave as "not installed".
 */
export function commonJSInteropOptions(): CommonJSInteropOptions {
  return {
    requireReturnsDefault: id => (isBuiltin(id) || UNWRAPPED_DRIVER_DEPENDENCIES.has(id) ? true : 'auto'),
    ignoreTryCatch: id => !isBuiltin(id),
  };
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
    //
    // Forward `options` unchanged: it carries the `custom` metadata `@rollup/plugin-commonjs`
    // uses to recognize a `require()` it is already resolving. Drop it and that plugin warns
    // (THIS_RESOLVE_WITHOUT_OPTIONS), then abandons the resolution.
    async resolveId(
      this: PluginContext,
      source: string,
      importer: string | undefined,
      options: Parameters<ResolveIdHook>[2],
    ) {
      if (source !== SNIPPET_IMPORT_SPECIFIER) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
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
