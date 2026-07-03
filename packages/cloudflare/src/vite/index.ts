// Published ESM-only via the `@sentry/cloudflare/vite` subpath export:
// `@sentry/server-utils/orchestrion/vite` exposes no `require` condition, so a
// CJS entry here would fail at resolution time (ERR_PACKAGE_PATH_NOT_EXPORTED).
// The CJS rollup variant still emits this file, but `package.json` doesn't
// expose it — same setup as `@sentry/server-utils/orchestrion/vite` itself.
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';

/**
 * Sentry Vite plugin for Cloudflare Workers.
 *
 * Injects `diagnostics_channel.tracingChannel` calls into bundled npm packages
 * (e.g. `mysql`) at build time via orchestrion, so the SDK can trace them
 * without monkey-patching, which wouldn't work in workerd anyway.
 *
 * The Cloudflare SDK detects the injection at runtime and subscribes to the
 * channels automatically; the worker itself only needs the usual
 * `Sentry.withSentry` wrapping.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { cloudflare } from '@cloudflare/vite-plugin';
 * import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
 *
 * export default {
 *   plugins: [
 *     sentryCloudflareVitePlugin(),
 *     cloudflare(),
 *   ],
 * };
 *
 * // src/index.ts (worker entry)
 * import * as Sentry from '@sentry/cloudflare';
 *
 * export default Sentry.withSentry(
 *   env => ({
 *     dsn: env.SENTRY_DSN,
 *     tracesSampleRate: 1.0,
 *   }),
 *   {
 *     async fetch(request, env, ctx) {
 *       // ...
 *     },
 *   } satisfies ExportedHandler,
 * );
 * ```
 */
export function sentryCloudflareVitePlugin() {
  return sentryOrchestrionPlugin();
}
