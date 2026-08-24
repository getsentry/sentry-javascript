import { sentryVitePlugin as sentryViteBundlerPlugin } from '@sentry/bundler-plugins/vite';
import type { SentryVitePluginOptions as SentryVitePluginOptionsBase } from '@sentry/bundler-plugins/vite';
import type { InstrumentationConfig } from '@sentry/server-utils';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { Plugin as VitePlugin } from 'vite';

export type SentryVitePluginOptions = SentryVitePluginOptionsBase & {
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
 * Vite plugin that bundles the Sentry Vite bundler plugin (source maps, release
 * injection, bundle size optimizations, …) together with the code
 * transformer (build-time `diagnostics_channel` instrumentation for Node
 * libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/vite` and accepts the
 * same options.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryVitePlugin } from '@sentry/node/vite';
 * export default { plugins: [sentryVitePlugin({ org: '…', project: '…' })] };
 * ```
 */
export function sentryVitePlugin(options?: SentryVitePluginOptions): VitePlugin[] {
  const bundlerPlugins = sentryViteBundlerPlugin(options);
  return [...bundlerPlugins, sentryOrchestrionPlugin(options)];
}
