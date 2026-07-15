import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { SENTRY_INSTRUMENTATIONS } from '../config';
import type codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';

export type PluginOptions = {
  /**
   * Additional instrumentations to include with the default instrumentation.
   */
  instrumentations?: InstrumentationConfig[];
};

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
  return {
    instrumentations: [...SENTRY_INSTRUMENTATIONS, ...(options.instrumentations || [])],
    injectDiagnostics: (diag: { transformedModules: string[]; failedModules: string[] }) => {
      return `(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{}).bundler=${JSON.stringify(diag.transformedModules)};`;
    },
  };
}
