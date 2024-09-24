import type { Plugin } from 'vite';
import { makeBuildInstrumentationFilePlugin } from './buildInstrumentationFile';
import { makeSourceMapsVitePlugin } from './sourceMaps';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * Various Sentry vite plugins to be used for SolidStart.
 */
export const sentrySolidStartVite = (options: SentrySolidStartPluginOptions = {}): Plugin[] => {
  const sentryPlugins: Plugin[] = [];

  sentryPlugins.push(makeBuildInstrumentationFilePlugin(options.instrumentation));

  if (process.env.NODE_ENV !== 'development') {
    if (options.sourceMapsUploadOptions?.enabled ?? true) {
      sentryPlugins.push(...makeSourceMapsVitePlugin(options));
    }
  }

  return sentryPlugins;
};
