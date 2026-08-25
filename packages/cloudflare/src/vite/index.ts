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
   * Path to the wrangler config, relative to the Vite root (or absolute).
   * Set this when your config doesn't use a default name — e.g. when you
   * pass `configPath: './wrangler.agent.jsonc'` to `@cloudflare/vite-plugin`,
   * which the Sentry plugin cannot see. When set, only this file is read
   * (no default-name probing), and a warning is emitted if it is missing or
   * unparseable.
   *
   * @default undefined (probes `wrangler.json`, `wrangler.jsonc`, `wrangler.toml` at the Vite root)
   */
  wranglerConfigPath?: string;
  /**
   * Build-time automatic instrumentation of supported dependencies (e.g.
   * database clients like `mysql`) so the Sentry Cloudflare SDK can trace them
   * without monkey-patching, which wouldn't work in workerd anyway.
   *
   * When enabled, the plugin injects `diagnostics_channel.tracingChannel` calls
   * into the bundled packages and, next to each, a snippet that registers the
   * matching Sentry channel-subscriber factory on the global marker, which the
   * SDK picks up in `Sentry.withSentry()`. Both `vite build` and `vite dev` are
   * instrumented. Set to `false` to opt out.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
  /**
   * Automatically wraps your Worker at build time so you don't have to edit
   * your entry: the plugin reads your wrangler config, wraps the default
   * export with `Sentry.withSentry()` (sourcing options from a co-located
   * `instrument.*` file, falling back to env), and wraps any configured
   * Durable Object class with `instrumentDurableObjectWithSentry`. Both
   * `vite build` and `vite dev` are instrumented. Already-wrapped entries are
   * left alone, so this is safe alongside manual instrumentation. Set to
   * `false` to opt out.
   *
   * @default true
   */
  autoInstrumentation?: boolean;
}

/**
 * Sentry Vite plugin for Cloudflare Workers.
 *
 * Add this plugin to your Vite configuration to enable additional Sentry
 * instrumentation for Cloudflare Workers built with Vite.
 *
 * By default, the plugin
 * - build-time instruments supported dependencies (such as database clients) so
 *   they are traced without changing your application code — opt out with
 *   `buildTimeInstrumentation: false`, and
 * - wraps your Worker entry (and any Durable Object, Workflow or
 *   WorkerEntrypoint class in your wrangler config) with the matching Sentry
 *   helper — opt out with `autoInstrumentation: false` and call
 *   `Sentry.withSentry()` yourself.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { cloudflare } from '@cloudflare/vite-plugin';
 * import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [cloudflare(), sentryCloudflareVitePlugin()],
 * });
 * ```
 */
export function sentryCloudflareVitePlugin(options: SentryCloudflareVitePluginOptions = {}): Array<{ name: string }> {
  return [
    sentryOrchestrionPlugin({
      buildTimeInstrumentation: options.buildTimeInstrumentation,
    }),
    ...(options.autoInstrumentation !== false
      ? [sentryCloudflareAutoInstrumentPlugin({ wranglerConfigPath: options.wranglerConfigPath })]
      : []),
  ];
}
