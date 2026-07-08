import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/webpack';
import { orchestrionTransformOptions } from './options';

/**
 * webpack plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with webpack. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * @example
 * ```ts
 * // webpack.config.mjs
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/webpack';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(): ReturnType<typeof codeTransformer> {
  return codeTransformer(orchestrionTransformOptions());
}
