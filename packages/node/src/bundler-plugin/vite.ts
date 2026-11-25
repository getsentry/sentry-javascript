import { sentryVitePlugin as sentryViteBundlerPlugin } from '@sentry/bundler-plugins/vite';
import type { SentryVitePluginOptions as SentryVitePluginOptionsBase } from '@sentry/bundler-plugins/vite';
import type { InstrumentationConfig } from '@sentry/server-utils';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { VitePlugin } from '@sentry/server-utils/orchestrion/vite';

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
  /**
   * Nitro only. The file that calls `Sentry.init()` on the server, relative to Nitro's root directory. The plugin
   * registers it as a Nitro plugin. Set to `false` to register nothing, for example when `Sentry.init()` runs elsewhere.
   *
   * @default `sentry.server.config.{ts,js,mjs,cjs,mts,cts}` in Nitro's root directory, when it exists
   */
  serverConfigFile?: string | false;
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
