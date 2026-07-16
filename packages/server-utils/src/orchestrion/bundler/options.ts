import type { InstrumentationConfig, CustomTransform } from '@apm-js-collab/code-transformer';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import type codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';

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

type OrchestrionTransformOptions = Parameters<typeof codeTransformer>[0];

/**
 * The `@apm-js-collab/code-transformer-bundler-plugins` options shared by every
 * orchestrion bundler plugin.
 *
 * `injectDiagnostics` sets `globalThis.__SENTRY_ORCHESTRION__.bundler = ["mysql"]` at
 * app boot so the `_experimentalSetupOrchestrion()` detector can confirm the
 * bundler path ran (rather than relying on a build-time flag that wouldn't be
 * visible to the runtime).
 */
export function orchestrionTransformOptions(options: PluginOptions): Parameters<typeof codeTransformer>[0] {
  const injectDiagnostics = (diag: { transformedModules: string[]; failedModules: string[] }) => {
    return `(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{}).bundler=${JSON.stringify(diag.transformedModules)};`;
  };

  const outputOptions: OrchestrionTransformOptions = {
    instrumentations: [...SENTRY_INSTRUMENTATIONS, ...(options.instrumentations || [])],
    customTransforms: options.customTransforms,
  };

  if (options.shouldInjectDiagnostics !== false) {
    outputOptions.injectDiagnostics = injectDiagnostics;
  }

  return outputOptions;
}
