/**
 * orchestrion build plugin for Bun. Use with `Bun.build`:
 *
 * Usage:
 *
 * ```ts
 * import { sentryBunPlugin } from '@sentry/bun/plugin';
 * await Bun.build({
 *   entrypoints: ['./app.ts'],
 *   plugins: [sentryBunPlugin()],
 * });
 * ```
 *
 * This is BUILD-ONLY. Runtime instrumentation (`bun run`) is intentionally not
 * offered: a module returned by a runtime `onLoad` plugin in Bun loses its
 * CommonJS named exports.
 *
 * When https://github.com/oven-sh/bun/pull/31770 lands, we can revisit.
 *
 * Until then, Bun apps must bundle to get orchestrion instrumentation. In dev
 * (ie, `bun run`) there is simply no instrumentation, which is clearer than
 * partial/inconsistent coverage.
 *
 * Shipped as both ESM and CJS (via the `@sentry/bun/plugin` subpath) so a user's
 * `bun build` script can be authored in either module system. It's a plain
 * library import here (not a `--import`/`--preload` hook), so CJS is fine; Bun
 * resolves the underlying ESM-only transformer in either module system.
 *
 * @module
 */
export { sentryBunPlugin } from '@sentry-internal/server-utils/orchestrion/bun';
