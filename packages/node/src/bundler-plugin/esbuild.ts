import { sentryEsbuildPlugin as sentryEsbuildBundlerPlugin } from '@sentry/bundler-plugins/esbuild';
import type { SentryEsbuildPluginOptions as SentryEsbuildPluginOptionsBase } from '@sentry/bundler-plugins/esbuild';
import type { BuildTimeInstrumentationOptions } from '@sentry/core';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';

export type SentryEsbuildPluginOptions = SentryEsbuildPluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: NonNullable<Parameters<typeof sentryOrchestrionPlugin>[0]>['instrumentations'];

  /**
   * Options related to automatic instrumentation of server-side dependencies at build time.
   *
   * Set `buildTimeInstrumentation.disable` to `true` to turn it off.
   */
  buildTimeInstrumentation?: BuildTimeInstrumentationOptions;
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
  const bundlerPlugin = sentryEsbuildBundlerPlugin(options) as EsbuildPlugin;

  return {
    name: 'sentry-node-esbuild',
    async setup(build): Promise<void> {
      await bundlerPlugin.setup(build);
      if (!options?.buildTimeInstrumentation?.disable) {
        await sentryOrchestrionPlugin(options).setup(build);
      }
    },
  };
}
