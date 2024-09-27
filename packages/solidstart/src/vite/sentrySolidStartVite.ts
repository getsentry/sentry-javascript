import type { Plugin, UserConfig } from 'vite';
import { makeBuildInstrumentationFilePlugin } from './buildInstrumentationFile';
import { makeSourceMapsVitePlugin } from './sourceMaps';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * Various Sentry vite plugins to be used for SolidStart.
 */
export const sentrySolidStartVite = (options: SentrySolidStartPluginOptions = {}): Plugin[] => {
  const sentryPlugins: Plugin[] = [];

  if (process.env.NODE_ENV !== 'development') {
    if (options.sourceMapsUploadOptions?.enabled ?? true) {
      sentryPlugins.push(...makeSourceMapsVitePlugin(options));
    }
  }

  // TODO: Ensure this file is source mapped too.
  // Placing this after the sentry vite plugin means this
  // file won't get a sourcemap and won't have a debug id injected.
  // Because the file is just copied over to the output server
  // directory the release injection file from sentry vite plugin
  // wouldn't resolve correctly otherwise.
  sentryPlugins.push(makeBuildInstrumentationFilePlugin(options));

  return sentryPlugins;
};

/**
 * Helper to add the Sentry SolidStart vite plugin to a vite config.
 */
export const addSentryPluginToVite = (config: UserConfig = {}, options: SentrySolidStartPluginOptions): UserConfig => {
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  plugins.unshift(sentrySolidStartVite(options));

  return {
    ...config,
    plugins,
  };
};
