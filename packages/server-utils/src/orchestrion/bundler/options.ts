import { SENTRY_INSTRUMENTATIONS } from '../config';
import { moduleInjectedTransforms, ORCHESTRION_BUNDLER_MARKER_BANNER } from './moduleInjectedTransform';
import type { CodeTransformerPluginOptions, InstrumentationConfig, CustomTransform } from '../apmTypes';

export { ORCHESTRION_BUNDLER_MARKER_BANNER };

export type PluginOptions = {
  /**
   * Additional instrumentations to include with the default instrumentation.
   */
  instrumentations?: InstrumentationConfig[];
  /**
   * Automatic instrumentation of server-side dependencies at build time.
   *
   * Set to `false` to make the plugin inert, so no instrumentation code is injected.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
  /**
   * Custom transforms that can be applied using the `transform` option in each
   * `InstrumentationConfig`.
   *
   * Only applied by the vite/rollup/esbuild/webpack plugins. Turbopack
   * serializes loader options as JSON, so functions can't reach its loader;
   * there, only the built-in Sentry transforms (baked into the loader module)
   * run.
   */
  customTransforms?: Record<string, CustomTransform>;
};

/**
 * Whether an "external" config entry covers an instrumented module: an exact
 * package name (`'mysql'`) or a subpath (`'mysql/lib/...'`) — the transform may
 * target exactly the file a subpath entry externalizes. Mirrors the matching in
 * `withoutInstrumentedExternals`.
 */
export function externalEntryMatchesModule(entry: string, moduleName: string): boolean {
  return entry === moduleName || entry.startsWith(`${moduleName}/`);
}

/**
 * Warning emitted when a bundler config externalizes packages that orchestrion
 * needs to transform. An externalized dependency is resolved from
 * `node_modules` at runtime and never passes through the code transform, so
 * its diagnostics_channel calls are silently never injected.
 */
export function externalizedModulesWarning(externalizedModules: string[]): string {
  return (
    `The following packages are marked as external in your bundler configuration but need to be bundled for Sentry ` +
    `instrumentation to work: ${externalizedModules.join(', ')}. Remove them from your bundler's "external" ` +
    `configuration, or use the Sentry Node SDK's runtime instrumentation instead.`
  );
}

/**
 * The `@apm-js-collab/code-transformer-bundler-plugins` options shared by every
 * orchestrion bundler plugin. This is the single assembly point for the plugin
 * options, so a new field added here reaches every bundler at once.
 *
 * The module-injected `tracingChannelImport` override is always on: it is how
 * every transformed module announces itself (and its channel-subscriber
 * factory) at evaluation time, on every bundler. It is spread last so a user
 * transform can't clobber it.
 *
 * `injectDiagnostics` returns the marker banner the upstream transformer prepends
 * to the output. Bun opts out (`{ injectDiagnostics: false }`) because it injects
 * the same banner via its native `banner` build config instead — see `bun.ts`.
 */
export function orchestrionTransformOptions(
  options: PluginOptions,
  { injectDiagnostics = true }: { injectDiagnostics?: boolean } = {},
): CodeTransformerPluginOptions {
  return {
    instrumentations: [...SENTRY_INSTRUMENTATIONS, ...(options.instrumentations || [])],
    customTransforms: { ...options.customTransforms, ...moduleInjectedTransforms() },
    ...(injectDiagnostics && { injectDiagnostics: () => ORCHESTRION_BUNDLER_MARKER_BANNER }),
  };
}
