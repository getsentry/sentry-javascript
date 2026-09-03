import { sentryWebpackPlugin as sentryWebpackBundlerPlugin } from '@sentry/bundler-plugins/webpack';
import type { SentryWebpackPluginOptions as SentryWebpackPluginOptionsBase } from '@sentry/bundler-plugins/webpack';
import type { InstrumentationConfig } from '@sentry/server-utils';
import { sentryOrchestrionWebpackPlugin } from '@sentry/server-utils/orchestrion/webpack';

export type SentryWebpackPluginOptions = SentryWebpackPluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: InstrumentationConfig[];

  /**
   * Automatic instrumentation of server-side dependencies at build time.
   *
   * Set to `false` to turn it off.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
};

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
 * import { sentryWebpackPlugin } from '@sentry/node/webpack';
 * export default { plugins: [sentryWebpackPlugin({ org: '…', project: '…' })] };
 * ```
 */
export function sentryWebpackPlugin(options?: SentryWebpackPluginOptions): {
  apply: (compiler: WebpackCompiler) => void;
} {
  const bundlerPlugin = sentryWebpackBundlerPlugin(options) as { apply: (compiler: WebpackCompiler) => void };
  const orchestrionPlugin = sentryOrchestrionWebpackPlugin(options) as { apply: (compiler: WebpackCompiler) => void };

  return {
    apply(compiler: WebpackCompiler): void {
      bundlerPlugin.apply(compiler);
      orchestrionPlugin.apply(compiler);
    },
  };
}
