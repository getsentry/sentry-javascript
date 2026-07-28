// Published ESM-only via the `@sentry/cloudflare/vite` subpath export:
// `@sentry/server-utils/orchestrion/vite` exposes no `require` condition, so a
// CJS entry here would fail at resolution time (ERR_PACKAGE_PATH_NOT_EXPORTED).
// The CJS rollup variant still emits this file, but `package.json` doesn't
// expose it — same setup as `@sentry/server-utils/orchestrion/vite` itself.
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { sentryCloudflareAutoInstrumentPlugin } from './autoInstrument';

/**
 * Options for {@link sentryCloudflareVitePlugin}.
 */
export interface SentryCloudflareVitePluginOptions {
  /**
   * Experimental options that may change or be removed without notice.
   */
  _experimental?: {
    /**
     * Enables build-time automatic instrumentation of supported dependencies
     * (e.g. database clients like `mysql`) so the Sentry Cloudflare SDK can
     * trace them without monkey-patching, which wouldn't work in workerd anyway.
     *
     * When enabled, the plugin injects `diagnostics_channel.tracingChannel`
     * calls into the bundled packages and, next to each, a snippet that
     * registers the matching Sentry channel-subscriber factory on the global
     * marker, which the SDK picks up in `Sentry.withSentry()`. Both `vite build`
     * and `vite dev` are instrumented.
     *
     * @default false
     * @experimental May change or be removed in any release.
     */
    useDiagnosticsChannelInjection?: boolean;
    /**
     * Automatically wraps your Worker at build time so you don't have to edit
     * your entry: the plugin reads your wrangler config, wraps the default
     * export with `Sentry.withSentry()` (sourcing options from a co-located
     * `instrument.*` file, falling back to env), and wraps any configured
     * Durable Object class with `instrumentDurableObjectWithSentry`. Both
     * `vite build` and `vite dev` are instrumented.
     *
     * When combined with `useDiagnosticsChannelInjection`, the injected Sentry
     * import targets `@sentry/cloudflare/nodejs_compat` rather than
     * `@sentry/cloudflare`, since channel injection requires the `nodejs_compat`
     * compatibility flag anyway and that entry exposes the full feature set.
     *
     * @default false
     * @experimental May change or be removed in any release.
     */
    autoInstrumentation?: boolean;
  };
}

/**
 * Sentry Vite plugin for Cloudflare Workers.
 *
 * Add this plugin to your Vite configuration to enable additional Sentry
 * instrumentation for Cloudflare Workers built with Vite. Configure the Sentry
 * SDK in your Worker as usual with `Sentry.withSentry()`.
 *
 * Currently, the only functionality is the experimental
 * `_experimental.useDiagnosticsChannelInjection` option, which traces supported
 * dependencies (such as database clients) without changing your application
 * code. Without it, the plugin is a no-op.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { cloudflare } from '@cloudflare/vite-plugin';
 * import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     cloudflare(),
 *     sentryCloudflareVitePlugin({
 *       _experimental: {
 *         useDiagnosticsChannelInjection: true,
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export function sentryCloudflareVitePlugin(options: SentryCloudflareVitePluginOptions = {}) {
  const useDiagnosticsChannelInjection = options._experimental?.useDiagnosticsChannelInjection ?? false;
  const autoInstrumentation = options._experimental?.autoInstrumentation ?? false;

  return [
    ...(useDiagnosticsChannelInjection ? [sentryOrchestrionPlugin({ injectChannelSubscribers: true })] : []),
    // Channel injection only runs under the `nodejs_compat` compatibility flag,
    // so the auto-instrumented entry imports the matching `nodejs_compat` SDK
    // entry to expose the full feature set.
    ...(autoInstrumentation
      ? [sentryCloudflareAutoInstrumentPlugin({ useNodejsCompatEntry: useDiagnosticsChannelInjection })]
      : []),
  ];
}
