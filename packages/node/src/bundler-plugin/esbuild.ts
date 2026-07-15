import { sentryEsbuildPlugin as sentryEsbuildBundlerPlugin } from '@sentry/bundler-plugins/esbuild';
import type { SentryEsbuildPluginOptions as SentryEsbuildPluginOptionsBase } from '@sentry/bundler-plugins/esbuild';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';

export type SentryEsbuildPluginOptions = SentryEsbuildPluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: NonNullable<Parameters<typeof sentryOrchestrionPlugin>[0]>['instrumentations'];
};

type EsbuildPlugin = ReturnType<typeof sentryOrchestrionPlugin>;

/**
 * esbuild plugin that bundles the Sentry esbuild bundler plugin (source maps,
 * release injection, …) together with the orchestrion code transform
 * (build-time `diagnostics_channel` instrumentation for Node libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/esbuild` and accepts
 * the same options.
 *
 * esbuild does not flatten nested `plugins` arrays, so this returns a single
 * plugin that runs both plugins' `setup` against the same build.
 *
 * @example
 * ```ts
 * // build.mjs
 * import { sentryEsbuildPlugin } from '@sentry/node/bundler-plugin/esbuild';
 * await esbuild.build({ plugins: [sentryEsbuildPlugin({ org: '…', project: '…' })] });
 * ```
 */
export function sentryEsbuildPlugin(options?: SentryEsbuildPluginOptions): EsbuildPlugin {
  const bundlerPlugin = sentryEsbuildBundlerPlugin(options);
  const orchestrionPlugin = sentryOrchestrionPlugin(options);

  return {
    name: 'sentry-node-esbuild',
    setup(build): void {
      bundlerPlugin.setup(build);
      orchestrionPlugin.setup(build);
    },
  };
}
