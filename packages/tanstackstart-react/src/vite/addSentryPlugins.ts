import type { PluginOption, UserConfig } from 'vite';
import type { SentryTanstackStartReactPluginOptions } from '../config/types';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';

/**
 * Adds Sentry plugins to the given array of Vite plugins.
 */
export function addSentryPlugins(
  plugins: PluginOption[],
  options: SentryTanstackStartReactPluginOptions,
  viteConfig: UserConfig,
): PluginOption[] {
  const sentryPlugins: PluginOption[] = [];

  // Only add source map plugins in production builds
  if (process.env.NODE_ENV !== 'development') {
    // Check if source maps upload is enabled
    // Default to enabled
    const sourceMapsEnabled = options.sourceMapsUploadOptions?.enabled ?? true;

    if (sourceMapsEnabled) {
      const sourceMapsPlugins = makeAddSentryVitePlugin(options, viteConfig);
      const enableSourceMapsPlugin = makeEnableSourceMapsVitePlugin(options);

      sentryPlugins.push(...sourceMapsPlugins, ...enableSourceMapsPlugin);
    }
  }

  // Prepend Sentry plugins so they run first
  return [...sentryPlugins, ...plugins];
}
