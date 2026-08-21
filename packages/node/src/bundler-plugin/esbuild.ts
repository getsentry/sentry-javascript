import { sentryEsbuildPlugin as sentryEsbuildBundlerPlugin } from '@sentry/bundler-plugins/esbuild';
import type { SentryEsbuildPluginOptions as SentryEsbuildPluginOptionsBase } from '@sentry/bundler-plugins/esbuild';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';
import { withChannelInjectionExclusionDefault } from './common';

export type SentryEsbuildPluginOptions = SentryEsbuildPluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: NonNullable<Parameters<typeof sentryOrchestrionPlugin>[0]>['instrumentations'];

  /**
   * Automatic instrumentation of server-side dependencies at build time.
   *
   * Set to `false` to turn it off.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
};

type EsbuildPlugin = ReturnType<typeof sentryOrchestrionPlugin>;

/**
 * esbuild plugin that bundles the Sentry esbuild bundler plugin (source maps,
 * release injection, …) together with the code transformer
 * (build-time `diagnostics_channel` instrumentation for Node libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/esbuild` and accepts
 * the same options.
 * @example
 * ```ts
 * // build.mjs
 * import { sentryEsbuildPlugin } from '@sentry/node/esbuild';
 * await esbuild.build({ plugins: [sentryEsbuildPlugin({ org: '…', project: '…' })] });
 * ```
 */
export function sentryEsbuildPlugin(options?: SentryEsbuildPluginOptions): EsbuildPlugin {
  const bundlerPlugin = sentryEsbuildBundlerPlugin(withChannelInjectionExclusionDefault(options)) as EsbuildPlugin;
  const orchestrionPlugin = sentryOrchestrionPlugin(options);

  return {
    name: 'sentry-node-esbuild',
    async setup(build): Promise<void> {
      await bundlerPlugin.setup(build);
      await orchestrionPlugin.setup(build);
    },
  };
}
