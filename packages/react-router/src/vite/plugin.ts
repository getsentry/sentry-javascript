import type { ConfigEnv } from 'vite';
import { type Plugin } from 'vite';
import { makeCustomSentryVitePlugins } from './makeCustomSentryVitePlugins';
import { makeEnableSourceMapsVitePlugin } from './sourceMaps';
import type { SentryReactRouterPluginOptions } from './types';

/**
 * A Vite plugin for Sentry that handles source map uploads and bundle size optimizations.
 *
 * @param options - Configuration options for the Sentry Vite plugin
 * @param viteConfig - The Vite user config object
 * @returns An array of Vite plugins
 */
export async function sentryReactRouter(
  options: SentryReactRouterPluginOptions = {},
  config: ConfigEnv,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  if (process.env.NODE_ENV !== 'development' && config.command === 'build') {
    plugins.push(makeEnableSourceMapsVitePlugin(options));
    plugins.push(...(await makeCustomSentryVitePlugins(options)));
  }

  return plugins;
}
