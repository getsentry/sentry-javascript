import type { ConfigEnv } from 'vite';
import { type Plugin } from 'vite';
import { makeSentryVitePlugins } from './makeSentryVitePlugin';
import { makeEnableSourceMapsVitePlugins } from './sourceMaps';
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

  if (process.env.NODE_ENV !== 'development') {
    if (options.sourceMapsUploadOptions?.enabled ?? true) {
      if (config.command === 'build' && config.isSsrBuild && config.mode === 'production') {
        plugins.push(...makeEnableSourceMapsVitePlugins(options));
        plugins.push(...(await makeSentryVitePlugins(options)));
      }
    }
  }

  return plugins;
}
