/**
 * EXPERIMENTAL: orchestrion runtime hook for Deno.
 *
 * Load this via the `--import` or `--preload` argument to `deno run` to
 * enable the channel-based instrumentations.
 *
 * For example:
 *
 * ```bash
 * $ deno run --import=@sentry/deno/import app.ts
 * ```
 *
 * @module
 */
import '@sentry/server-utils/orchestrion/import-hook';
