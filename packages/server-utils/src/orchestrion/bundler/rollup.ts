import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import { withoutInstrumentedExternals } from '../config';
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
  return {
    ...codeTransformer(orchestrionTransformOptions(options)),
    // The `options` hook runs before the build starts and can rewrite the
    // resolved input options. Rollup's `external` may be a string, RegExp,
    // function, or array of `string | RegExp`; `withoutInstrumentedExternals`
    // only understands a string denylist, so we touch only that form and leave
    // every other shape untouched.
    options(inputOptions) {
      const { external } = inputOptions;
      if (Array.isArray(external) && external.every(entry => typeof entry === 'string')) {
        return { ...inputOptions, external: withoutInstrumentedExternals(external) };
      }
      return null;
    },
  };
}
