// Published ESM-only via the `@sentry/cloudflare/vite` subpath export:
// `@sentry/server-utils/orchestrion/vite` exposes no `require` condition, so a
// CJS entry here would fail at resolution time (ERR_PACKAGE_PATH_NOT_EXPORTED).
// The CJS rollup variant still emits this file, but `package.json` doesn't
// expose it — same setup as `@sentry/server-utils/orchestrion/vite` itself.
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import { sentryCloudflareAutoInstrumentPlugin, type SentryCloudflareAutoInstrumentOptions } from './autoInstrument';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnknownPlugin = any;

/**
 * Sentry Vite plugin for Cloudflare Workers.
 *
 * Combines two build-time transforms:
 *
 * 1. **Orchestrion** — injects `diagnostics_channel.tracingChannel` calls into
 *    bundled npm packages (e.g. `mysql`) so the SDK can trace them without
 *    monkey-patching.
 *
 * 2. **Auto-instrument** — reads `wrangler.toml`, finds the worker entry file
 *    and Durable Object class names, then wraps the default export with
 *    `withSentry` and DO classes with `instrumentDurableObjectWithSentry`
 *    automatically. No manual Sentry wrapping required in user code.
 *
 *    To configure the SDK, place an `instrument.server.{ts,js,mjs}` file next
 *    to the worker entry whose default export is your options callback. It is
 *    picked up automatically. Without it, the SDK reads its configuration (DSN,
 *    release, environment, …) from the worker's `env` at runtime.
 *
 * Returns a Vite plugin preset (an array of plugins). Add it to `plugins`
 * directly — Vite flattens nested plugin arrays, so there is no need to spread
 * it with `...`.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { cloudflare } from '@cloudflare/vite-plugin';
 * import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
 *
 * export default {
 *   plugins: [
 *     cloudflare(),
 *     sentryCloudflareVitePlugin(),
 *   ],
 * };
 *
 * // src/instrument.server.ts (next to the worker entry — auto-detected)
 * import { defineCloudflareOptions } from '@sentry/cloudflare';
 * export default defineCloudflareOptions((env) => ({
 *   dsn: env.SENTRY_DSN,
 *   tracesSampleRate: 1.0,
 * }));
 * ```
 */
export function sentryCloudflareVitePlugin(pluginOptions?: SentryCloudflareAutoInstrumentOptions): UnknownPlugin[] {
  return [...sentryOrchestrionPlugin(), sentryCloudflareAutoInstrumentPlugin(pluginOptions)];
}

export type { SentryCloudflareAutoInstrumentOptions };
