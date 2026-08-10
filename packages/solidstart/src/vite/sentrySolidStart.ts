import type { SentryVitePluginOptions } from '@sentry/bundler-plugins/vite';
import type { BuildTimeOptionsBase, UnstableVitePluginOptions } from '@sentry/core';
import { setupSentryNitroModule } from '@sentry/nitro';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { Plugin, UserConfig } from 'vite';
import { makeAddSentryVitePluginSolidStart2, makeEnableSourceMapsVitePlugin } from './sourceMaps';

/**
 * Build-time options for the Sentry SolidStart SDK on SolidStart 2.
 */
export type SentrySolidStartOptions = BuildTimeOptionsBase & UnstableVitePluginOptions<SentryVitePluginOptions>;

/**
 * Vite plugins for the Sentry SolidStart SDK. Requires SolidStart 2.
 *
 * On SolidStart 1, use `withSentry` in `app.config.ts` instead.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { sentrySolidStart } from '@sentry/solidstart/vite';
 * import { solidStart } from '@solidjs/start/config';
 * import { nitro } from 'nitro/vite';
 * import { defineConfig } from 'vite';
 *
 * export default defineConfig({
 *   plugins: [
 *     solidStart(),
 *     sentrySolidStart({
 *       org: 'your-org',
 *       project: 'your-project',
 *     }),
 *     nitro(),
 *   ],
 * });
 * ```
 *
 * @param options - Options to configure the Sentry Vite plugins
 * @returns An array of Vite plugins
 */
export function sentrySolidStart(options: SentrySolidStartOptions = {}): Plugin[] {
  const plugins: Plugin[] = [makeSentryNitroPlugin(options)];

  // Only the Nitro plugin is dev-safe; its module handles `dev` itself.
  if (process.env.NODE_ENV === 'development') {
    return plugins;
  }

  // Injects `diagnostics_channel` publishers into instrumented deps at build time, which is what
  // lets `Sentry.init()` run from a bundled Nitro plugin rather than an `--import` preload.
  plugins.push(sentryOrchestrionPlugin({ buildTimeInstrumentation: options.buildTimeInstrumentation }));

  if (options.sourcemaps?.disable !== true) {
    plugins.push(...makeAddSentryVitePluginSolidStart2(options), ...makeEnableSourceMapsVitePlugin(options));
  }

  return plugins;
}

// Nitro's `NitroConfig` only matches `@sentry/nitro`'s when both resolve the same `nitro` install,
// which is not guaranteed, so the key stays opaque rather than coupling the two copies.
type ViteConfigWithNitro = UserConfig & { nitro?: Record<string, unknown> };

/**
 * Delivers everything only Nitro can reach — server source maps, runtime hooks, the
 * `sourcemapMinify` opt-out — through Vite's `nitro` key.
 *
 * `setupSentryNitroModule` is handed only the keys it reads, never the user's whole config, so what
 * comes back is purely Sentry's additions. Vite concatenates arrays when merging a `config` return
 * value, so echoing the user's own `modules`/`plugins` back would duplicate every entry.
 *
 * `enforce: 'pre'` is load-bearing: Nitro creates its instance inside its own `config` hook, so a
 * normal-priority hook sorting after it would be read too late and silently ignored.
 */
function makeSentryNitroPlugin(options: SentrySolidStartOptions): Plugin {
  return {
    name: 'sentry-solidstart-nitro',
    enforce: 'pre',
    config(userConfig: ViteConfigWithNitro) {
      const userNitro = userConfig.nitro;

      return {
        nitro: setupSentryNitroModule(
          // `sourcemap` decides whether Sentry enables its own; `tracingChannel` is left as the user set it.
          { sourcemap: userNitro?.sourcemap, tracingChannel: userNitro?.tracingChannel } as Parameters<
            typeof setupSentryNitroModule
          >[0],
          options,
        ) as Record<string, unknown>,
      } as Omit<UserConfig, 'plugins'>;
    },
  };
}
