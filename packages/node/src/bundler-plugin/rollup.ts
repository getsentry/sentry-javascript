import { sentryRollupPlugin as sentryRollupBundlerPlugin } from '@sentry/bundler-plugins/rollup';
import type { SentryRollupPluginOptions as SentryRollupPluginOptionsBase } from '@sentry/bundler-plugins/rollup';
import type { InstrumentationConfig } from '@sentry/server-utils';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
import type { Plugin as RollupPlugin } from 'rollup';

export type SentryRollupPluginOptions = SentryRollupPluginOptionsBase & {
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

/**
 * Rollup plugin that bundles the Sentry Rollup bundler plugin (source maps,
 * release injection, bundle size optimizations, …) together with the
 * code transformer (build-time `diagnostics_channel` instrumentation
 * for Node libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/rollup` and accepts
 * the same options.
 * @example
 * ```ts
 * // rollup.config.js
 * import { sentryRollupPlugin } from '@sentry/node/rollup';
 * export default { plugins: [sentryRollupPlugin({ org: '…', project: '…' })] };
 * ```
 */
export function sentryRollupPlugin(options?: SentryRollupPluginOptions): RollupPlugin[] {
  const bundlerPlugins = sentryRollupBundlerPlugin(options);
  return [...bundlerPlugins, sentryOrchestrionPlugin(options)];
}
