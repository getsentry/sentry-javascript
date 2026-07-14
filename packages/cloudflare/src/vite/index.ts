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
 * It also injects a generated registration module into the bundle, which
 * registers the matching channel-subscriber integrations for `Sentry.init` to
 * pick up. The SDK itself doesn't import them, so workers built without this
 * plugin don't ship that code; the worker only needs the usual
 * `Sentry.withSentry` wrapping.
 *
 * Both `vite build` (and `wrangler deploy` of that output) and the `vite dev`
 * server are instrumented. In dev the instrumented packages are pre-bundled by
 * Vite's dep optimizer, so the transform is wired into the optimizer's esbuild
 * pass; every registered channel integration is active in dev since the build's
 * `transformedModules` narrowing list isn't available there.
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
  return sentryOrchestrionPlugin({ registerIntegrations: true });
}
