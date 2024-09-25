import type { Plugin } from 'vite';
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
