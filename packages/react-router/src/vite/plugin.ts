import type { ConfigEnv } from 'vite';
import { type Plugin } from 'vite';
import { makeCustomSentryVitePlugins } from './makeCustomSentryVitePlugins';
import { makeEnableSourceMapsPlugin } from './makeEnableSourceMapsPlugin';
import type { SentryReactRouterBuildOptions } from './types';
import { makeConfigInjectorPlugin } from './makeConfigInjectorPlugin';

/**
 * A Vite plugin for Sentry that handles source map uploads and bundle size optimizations.
 *
 * @param options - Configuration options for the Sentry Vite plugin
 * @param viteConfig - The Vite user config object
 * @returns An array of Vite plugins
 */
export async function sentryReactRouter(
  options: SentryReactRouterBuildOptions = {},
  config: ConfigEnv,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  plugins.push(makeConfigInjectorPlugin(options));

  if (process.env.NODE_ENV !== 'development' && config.command === 'build' && config.mode !== 'development') {
    plugins.push(makeEnableSourceMapsPlugin(options));
    plugins.push(...(await makeCustomSentryVitePlugins(options)));
  }

  return plugins;
}
