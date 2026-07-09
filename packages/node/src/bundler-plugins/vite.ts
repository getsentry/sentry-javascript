import { sentryVitePlugin as sentryViteBundlerPlugin } from '@sentry/bundler-plugins/vite';
import type { SentryVitePluginOptions as SentryVitePluginOptionsBase } from '@sentry/bundler-plugins/vite';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';

export type SentryVitePluginOptions = SentryVitePluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: NonNullable<Parameters<typeof sentryOrchestrionPlugin>[0]>['instrumentations'];
};

type VitePlugin = ReturnType<typeof sentryOrchestrionPlugin>;

/**
 * Vite plugin that bundles the Sentry Vite bundler plugin (source maps, release
 * injection, bundle size optimizations, …) together with the orchestrion code
 * transform (build-time `diagnostics_channel` instrumentation for Node
 * libraries).
 *
 * It is a drop-in replacement for `@sentry/bundler-plugins/vite` and accepts the
 * same options.
 *
 * Vite flattens nested `plugins` arrays, so `plugins: [sentryVitePlugin(opts)]`
 * works directly.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryVitePlugin } from '@sentry/node/bundler-plugins/vite';
 * export default { plugins: [sentryVitePlugin({ org: '…', project: '…' })] };
 * ```
 */
export function sentryVitePlugin(options?: SentryVitePluginOptions): VitePlugin[] {
  return [...sentryViteBundlerPlugin(options), sentryOrchestrionPlugin(options)];
}
