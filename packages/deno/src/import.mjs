/**
 * Orchestrion runtime hook for Deno.
 *
 * `init()` registers the same hook, but it only applies to modules imported
 * after `init()`. Load this via the `--preload` argument to `deno run` to also
 * instrument modules imported before it, such as static imports in the entry
 * module.
 *
 * For example:
 *
 * ```bash
 * $ deno run --preload=npm:@sentry/deno/import app.ts
 * ```
 *
 * @module
 */
import '@sentry/server-runtime-injection/import-hook';
