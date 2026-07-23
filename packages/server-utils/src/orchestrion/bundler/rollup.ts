import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import type { NormalizedInputOptions, Plugin, PluginContext } from 'rollup';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalizedModulesWarning, orchestrionTransformOptions } from './options';

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
  const moduleNames = instrumentedModuleNames(options.instrumentations);

  return {
    ...codeTransformer(orchestrionTransformOptions(options)),
    buildStart(this: PluginContext, rollupOptions: NormalizedInputOptions): void {
      // An externalized dependency never passes through the code transform, so
      // its diagnostics_channel calls are silently never injected. By the time
      // buildStart runs, Rollup has normalized `external` (string arrays,
      // RegExps or user functions) into a single predicate we can probe.
      const externalizedModules = moduleNames.filter(name => rollupOptions.external(name, undefined, false));
      if (externalizedModules.length > 0) {
        this.warn(externalizedModulesWarning(externalizedModules));
      }
    },
  };
}
