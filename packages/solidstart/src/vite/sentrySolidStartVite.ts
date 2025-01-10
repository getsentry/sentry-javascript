import type { Plugin, UserConfig } from 'vite';
import { makeBuildInstrumentationFilePlugin } from './buildInstrumentationFile';
import { makeSourceMapsVitePlugin } from './sourceMaps';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * Various Sentry vite plugins to be used for SolidStart.
 */
export const sentrySolidStartVite = (options: SentrySolidStartPluginOptions = {}): Plugin[] => {
  const sentryPlugins: Plugin[] = [];

  if (options.autoInjectServerSentry !== 'experimental_dynamic-import') {
    sentryPlugins.push(makeBuildInstrumentationFilePlugin(options));
  }

  if (process.env.NODE_ENV !== 'development') {
    if (options.sourceMapsUploadOptions?.enabled ?? true) {
      sentryPlugins.push(...makeSourceMapsVitePlugin(options));
    }
  }

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
