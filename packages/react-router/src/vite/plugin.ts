import type { Plugin, UserConfig } from 'vite';
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
export function sentryReactRouter(options: SentryReactRouterPluginOptions = {}, viteConfig: UserConfig): Plugin[] {
  const plugins: Plugin[] = [];

  if (process.env.NODE_ENV !== 'development') {
    if (options.sourceMapsUploadOptions?.enabled ?? true) {
      plugins.push(...makeSentryVitePlugins(options, viteConfig));
      plugins.push(...makeEnableSourceMapsVitePlugins(options));
    }
  }

  return plugins;
}
