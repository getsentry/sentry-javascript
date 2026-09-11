/**
 * Sentry code-transform plugin for Bun's bundler (`bun build`).
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
 * This is BUILD-ONLY. Runtime instrumentation (`bun run`) is currently not supported.
 *
 * @module
 */
export { sentryOrchestrionPlugin as sentryBunPlugin } from '@sentry/server-utils/orchestrion/bun';
