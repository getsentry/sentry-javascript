import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import type { PluginOptions } from './options';
import { orchestrionTransformOptions } from './options';

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
export function sentryOrchestrionPlugin(options: PluginOptions = {}): ReturnType<typeof codeTransformer> {
  return codeTransformer(orchestrionTransformOptions(options));
}
