/**
 * EXPERIMENTAL: orchestrion runtime hook for Deno.
 *
 * In Deno versions prior to 2.8.0, this will crash, as it
 * relies on `Module.registerHooks`, which was added in that
 * version.
 *
 * As of Deno 2.8.3, this can be loaded via `--import` or `--preload`
 * argument to `deno run` in order to enable these instrumentations.
 *
 * For example:
 *
 * ```bash
 * $ deno run --import=@sentry/deno/import app.ts
 * ```
 *
 * In Deno 2.8.0 through 2.8.2, it can be loaded directly in an
 * `init.ts` file that then loads the app via dynamic import.
 *
 * For example:
 *
 * ```ts
 * // init.ts
 * import '@sentry/deno/import';
 * await import('./app.ts');
 * ```
 *
 * @module
 */
import '@sentry-internal/server-utils/orchestrion/import-hook';
