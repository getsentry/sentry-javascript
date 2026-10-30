/**
 * Sentry plugin for Bun's bundler (`bun build`).
 *
 * Usage:
 *
 * ```ts
 * import { sentryBunPlugin } from '@sentry/bun/plugin';
 * await Bun.build({
 *   entrypoints: ['./app.ts'],
 *   outdir: './dist',
 *   sourcemap: 'external',
 *   plugins: [sentryBunPlugin({ org: '…', project: '…', authToken: process.env.SENTRY_AUTH_TOKEN })],
 * });
 * ```
 *
 * This is BUILD-ONLY. Runtime instrumentation (`bun run`) is currently not supported.
 *
 * @module
 */
import { sentryBunPlugin as sentryBunBundlerPlugin } from '@sentry/bundler-plugins/bun';
import type { SentryBunPluginOptions as SentryBunPluginOptionsBase } from '@sentry/bundler-plugins/bun';
import type { InstrumentationConfig } from '@sentry/server-utils';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/bun';

export type SentryBunPluginOptions = SentryBunPluginOptionsBase & {
  /**
   * @ignore This is for internal use only when this plugin is consumed by a framework SDK
   */
  instrumentations?: InstrumentationConfig[];

  /**
   * Automatic instrumentation of server-side dependencies at build time.
   *
   * Set to `false` to turn it off.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;
};

/**
 * Bun plugin that combines the Sentry bundler plugin (source maps, release
 * injection, …) with the code transformer (build-time `diagnostics_channel`
 * instrumentation for server libraries).
 */
// oxlint-disable-next-line typescript/no-explicit-any
export function sentryBunPlugin(options?: SentryBunPluginOptions): any {
  const bundlerPlugin = sentryBunBundlerPlugin(options);
  const orchestrionPlugin: { setup: (build: unknown) => void } = sentryOrchestrionPlugin(options);

  return {
    name: 'sentry-bun',
    setup(build: Parameters<typeof bundlerPlugin.setup>[0]): void {
      bundlerPlugin.setup(build);
      orchestrionPlugin.setup(build);
    },
  };
}
