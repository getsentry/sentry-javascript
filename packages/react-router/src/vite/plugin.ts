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
    // Build-time `diagnostics_channel` injection for instrumented server deps (mysql, ioredis, …).
    // Build-only: `ssr.noExternal` force-bundles CJS deps, which Vite's dev SSR can't interop. Cloudflare/workerd out of scope — opt out via `buildTimeInstrumentation: false`.
    plugins.push(sentryOrchestrionPlugin({ buildTimeInstrumentation: options.buildTimeInstrumentation }));
    plugins.push(makeEnableSourceMapsPlugin(options));
    plugins.push(...(await makeCustomSentryVitePlugins(options)));
  }

  return plugins;
}
