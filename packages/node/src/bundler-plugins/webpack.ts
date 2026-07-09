import { sentryWebpackPlugin as sentryWebpackBundlerPlugin } from '@sentry/bundler-plugins/webpack';
import type { SentryWebpackPluginOptions as SentryWebpackPluginOptionsBase } from '@sentry/bundler-plugins/webpack';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/webpack';

export type SentryWebpackPluginOptions = SentryWebpackPluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: NonNullable<Parameters<typeof sentryOrchestrionPlugin>[0]>['instrumentations'];
};

type WebpackCompiler = Parameters<ReturnType<typeof sentryOrchestrionPlugin>['apply']>[0];

/**
 * webpack plugin that bundles the Sentry webpack bundler plugin (source maps,
 * release injection, …) together with the orchestrion code transform
 * (build-time `diagnostics_channel` instrumentation for Node libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/webpack` and accepts
 * the same options.
 *
 * webpack does not flatten nested `plugins` arrays, so this returns a single
 * plugin that runs both plugins' `apply` against the same compiler.
 *
 * @example
 * ```ts
 * // webpack.config.mjs
 * import { sentryWebpackPlugin } from '@sentry/node/bundler-plugins/webpack';
 * export default { plugins: [sentryWebpackPlugin({ org: '…', project: '…' })] };
 * ```
 */
export function sentryWebpackPlugin(options?: SentryWebpackPluginOptions): {
  apply: (compiler: WebpackCompiler) => void;
} {
  const bundlerPlugin = sentryWebpackBundlerPlugin(options);
  const orchestrionPlugin = sentryOrchestrionPlugin(options);

  return {
    apply(compiler: WebpackCompiler): void {
      bundlerPlugin.apply(compiler);
      orchestrionPlugin.apply(compiler);
    },
  };
}
