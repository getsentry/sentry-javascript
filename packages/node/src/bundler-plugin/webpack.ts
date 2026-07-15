import { sentryWebpackPlugin as sentryWebpackBundlerPlugin } from '@sentry/bundler-plugins/webpack';
import type { SentryWebpackPluginOptions } from '@sentry/bundler-plugins/webpack';
import { sentryOrchestrionWebpackPlugin } from '@sentry/server-utils/orchestrion/webpack';

export type { SentryWebpackPluginOptions };

type WebpackCompiler = Parameters<ReturnType<typeof sentryWebpackBundlerPlugin>['apply']>[0];

/**
 * webpack plugin that bundles the Sentry webpack bundler plugin (source maps,
 * release injection, …) together with the code transformer
 * (build-time `diagnostics_channel` instrumentation for Node libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/webpack` and accepts
 * the same options.
 * @example
 * ```ts
 * // webpack.config.mjs
 * import { sentryWebpackPlugin } from '@sentry/node/bundler-plugin/webpack';
 * export default { plugins: [sentryWebpackPlugin({ org: '…', project: '…' })] };
 * ```
 */
export function sentryWebpackPlugin(options?: SentryWebpackPluginOptions): {
  apply: (compiler: WebpackCompiler) => void;
} {
  const bundlerPlugin = sentryWebpackBundlerPlugin(options) as { apply: (compiler: WebpackCompiler) => void };
  const orchestrionPlugin = sentryOrchestrionWebpackPlugin() as { apply: (compiler: WebpackCompiler) => void };

  return {
    apply(compiler: WebpackCompiler): void {
      bundlerPlugin.apply(compiler);
      orchestrionPlugin.apply(compiler);
    },
  };
}
