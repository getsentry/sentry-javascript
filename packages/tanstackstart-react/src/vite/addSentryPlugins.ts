import type { BuildTimeOptionsBase } from '@sentry/core';
import type { PluginOption, UserConfig } from 'vite';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';

/**
 * Adds Sentry plugins to the given array of Vite plugins.
 */
export function addSentryPlugins(
  plugins: PluginOption[],
  options: BuildTimeOptionsBase,
  viteConfig: UserConfig,
): PluginOption[] {
  const sentryPlugins: PluginOption[] = [];

  // Only add source map plugins in production builds
  if (process.env.NODE_ENV !== 'development') {
    // Check if source maps upload is enabled, default is enabled
    const sourceMapsDisabled = options.sourcemaps?.disable === true || options.sourcemaps?.disable === 'disable-upload';

    if (!sourceMapsDisabled) {
      const sourceMapsPlugins = makeAddSentryVitePlugin(options, viteConfig);
      const enableSourceMapsPlugin = makeEnableSourceMapsVitePlugin(options);

      sentryPlugins.push(...sourceMapsPlugins, ...enableSourceMapsPlugin);
    }
  }

  // Prepend Sentry plugins so they run first
  return [...sentryPlugins, ...plugins];
}
