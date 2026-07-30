import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
import type { ConfigEnv, Plugin } from 'vite';
import { makeConfigInjectorPlugin } from './makeConfigInjectorPlugin';
import { makeCustomSentryVitePlugins } from './makeCustomSentryVitePlugins';
import { makeEnableSourceMapsPlugin } from './makeEnableSourceMapsPlugin';
import { makeServerBuildCapturePlugin } from './makeServerBuildCapturePlugin';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * A Vite plugin for Sentry that handles source map uploads and bundle size optimizations.
 *
 * @param options - Configuration options for the Sentry Vite plugin
 * @param viteConfig - The Vite user config object
 * @returns An array of Vite plugins
 */
export async function sentryReactRouter(
  options: SentryReactRouterBuildOptions = {},
  viteConfig: ConfigEnv,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  plugins.push(makeConfigInjectorPlugin(options));
  plugins.push(makeServerBuildCapturePlugin());

  if (process.env.NODE_ENV !== 'development' && viteConfig.command === 'build' && viteConfig.mode !== 'development') {
    // Injects `diagnostics_channel` publishers into instrumented server-side deps (mysql, ioredis, …)
    // at build time. Only wired into the bundled server build: the plugin force-bundles CJS deps via
    // `ssr.noExternal`, which Vite's dev SSR server can't interop (`exports is not defined`), and there
    // is nothing to transform in dev anyway. `applyToEnvironment` further keeps it off client bundles.
    // TODO: Cloudflare/workerd targets need different wiring and are skipped for now — opt out there via
    // `buildTimeInstrumentation: false`.
    plugins.push(sentryOrchestrionPlugin({ buildTimeInstrumentation: options.buildTimeInstrumentation }));
    plugins.push(makeEnableSourceMapsPlugin(options));
    plugins.push(...(await makeCustomSentryVitePlugins(options)));
  }

  return plugins;
}
