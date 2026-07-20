import type { InstrumentationConfig, CustomTransform } from '..';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import { buildInjectBootSnippet } from './inject';
import type { CodeTransformerPluginOptions } from '@apm-js-collab/code-transformer-bundler-plugins/core';

export type PluginOptions = {
  /**
   * Additional instrumentations to include with the default instrumentation.
   */
  instrumentations?: InstrumentationConfig[];
  /**
   * Custom transforms that can be applied using the `transform` option in each `InstrumentationConfig`.
   */
  customTransforms?: Record<string, CustomTransform>;
  /**
   * Whether to inject the global diagnostics.
   *
   * Defaults to `true`.
   */
  shouldInjectDiagnostics?: boolean;
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
 * orchestrion bundler plugin.
 *
 * `injectDiagnostics` sets `globalThis.__SENTRY_ORCHESTRION__.bundler = ["mysql"]` at
 * app boot so the `_experimentalSetupOrchestrion()` detector can confirm the
 * bundler path ran (rather than relying on a build-time flag that wouldn't be
 * visible to the runtime), and announces each module via the on-inject bridge so
 * channel subscribers wire up even when `Sentry.init()` ran before this snippet.
 */
export function orchestrionTransformOptions(options: PluginOptions): CodeTransformerPluginOptions {
  const instrumentations = [...SENTRY_INSTRUMENTATIONS, ...(options.instrumentations || [])];
  const customTransforms = options.customTransforms;

  if (options.shouldInjectDiagnostics === false) {
    return {
      instrumentations,
      customTransforms,
    };
  }

  return {
    instrumentations,
    customTransforms,
    injectDiagnostics: (diag: { transformedModules: string[]; failedModules: string[] }) => {
      return buildInjectBootSnippet(diag.transformedModules);
    },
  };
}
