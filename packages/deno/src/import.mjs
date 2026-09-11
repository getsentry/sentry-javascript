/**
 * Orchestrion runtime hook for Deno.
 *
 * Load this via the `--preload` argument to `deno run` to enable the
 * channel-based instrumentations.
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
