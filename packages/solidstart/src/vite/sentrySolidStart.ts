import {
  _INTERNAL_normalizeTunnelBasePath as normalizeTunnelBasePath,
  type BuildTimeOptionsBase,
  stringifyForCodeInjection,
  warnOnRemovedBuildOptions,
} from '@sentry/core';
import { setupSentryNitroModule } from '@sentry/nitro';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { Plugin, UserConfig } from 'vite';
import { makeAddSentryVitePluginSolidStart2, makeEnableSourceMapsVitePlugin } from './sourceMaps';

/**
 * Build-time options for the Sentry SolidStart SDK on SolidStart 2.
 */
export type SentrySolidStartOptions = BuildTimeOptionsBase;

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
  warnOnRemovedBuildOptions(options, ['unstable_sentryVitePluginOptions']);

  const plugins: Plugin[] = [makeSentryNitroPlugin(options), makeServerEntryPlugin()];

  // Only the Nitro and server entry plugins are dev-safe; the Nitro module handles `dev` itself.
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

const SERVER_RUNTIME_CONDITION = 'sentry-solidstart-runtime';

/**
 * Resolves `@sentry/solidstart` in server environments to the entry without the deprecated SolidStart 1
 * `withSentry`. Its build-time imports (Sentry CLI, oxc-parser) otherwise end up in the server output:
 * Nitro traces their native files, and Rolldown still emits the CLI's dynamic-import chunks after
 * tree-shaking the code that imports them.
 */
function makeServerEntryPlugin(): Plugin {
  return {
    name: 'sentry-solidstart-server-entry',
    configEnvironment(name, config) {
      // Vite concatenates the returned conditions onto these. If none are set yet, returning one would
      // replace Vite's defaults, so leave resolution alone.
      if (name === 'client' || config.consumer === 'client' || !config.resolve?.conditions) {
        return;
      }

      return { resolve: { conditions: [SERVER_RUNTIME_CONDITION] } };
    },
  };
}

// Nitro's `NitroConfig` only matches `@sentry/nitro`'s when both resolve the same `nitro` install,
// which is not guaranteed, so the key stays opaque rather than coupling the two copies.
type ViteConfigWithNitro = UserConfig & {
  nitro?: Record<string, unknown>;
  server?: UserConfig['server'] & { baseURL?: string };
};

/**
 * Delivers everything only Nitro can reach — server source maps, runtime hooks, the
 * `sourcemapMinify` opt-out — through Vite's `nitro` key, and the app's base path to the browser SDK.
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
      // SolidStart serves the app under Vite's `base` (or `server.baseURL`), not Nitro's `baseURL`, so the browser
      // and the server both serve the managed tunnel under it.
      const tunnelBasePath = normalizeTunnelBasePath(userConfig.server?.baseURL || userConfig.base);

      return {
        define: { __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__: stringifyForCodeInjection(tunnelBasePath) },
        nitro: {
          ...(setupSentryNitroModule(
            // `sourcemap` decides whether Sentry enables its own; `tracingChannel` is left as the user set it.
            { sourcemap: userNitro?.sourcemap, tracingChannel: userNitro?.tracingChannel } as Parameters<
              typeof setupSentryNitroModule
            >[0],
            options,
          ) as Record<string, unknown>),
          // `@sentry/nitro` serves the tunnel under this instead of Nitro's `baseURL`.
          ...(tunnelBasePath && { runtimeConfig: { sentryTunnelBasePath: tunnelBasePath } }),
        },
      } as Omit<UserConfig, 'plugins'>;
    },
  };
}
