import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/esbuild';
import type { PluginOptions } from './options';
import { orchestrionTransformOptions } from './options';

/**
 * esbuild plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with esbuild. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * esbuild does not flatten nested `plugins` arrays, so this returns a single
 * plugin that strips instrumented packages from an `external` denylist before
 * delegating to the upstream transform.
 *
 * @example
 * ```ts
 * // build.mjs
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';
 * await esbuild.build({ plugins: [sentryOrchestrionPlugin()] });
 * ```
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): ReturnType<typeof codeTransformer> {
  return codeTransformer(orchestrionTransformOptions(options));
}
