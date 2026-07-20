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
