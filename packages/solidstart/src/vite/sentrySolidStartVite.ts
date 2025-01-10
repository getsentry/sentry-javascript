import type { Plugin, UserConfig } from 'vite';
import { makeBuildInstrumentationFilePlugin } from './buildInstrumentationFile';
import { makeSourceMapsVitePlugin } from './sourceMaps';
import type { SentrySolidStartPluginOptions } from './types';

// todo(v9): Don't export to users anymore and remove deprecation (and eslint warning silencing) when it's not exported anymore
/**
 * Various Sentry vite plugins to be used for SolidStart.
 *
 * @deprecated This plugin will be removed in v9. Instead, use `withSentry` to wrap your SolidStart config. Example:
 * ```
 * export default defineConfig(
 *   withSentry(
 *     {
 *       // SolidStart config...
 *     },
 *     {
 *       // Sentry config
 *       org: process.env.SENTRY_ORG,
 *       project: process.env.SENTRY_PROJECT,
 *       authToken: process.env.SENTRY_AUTH_TOKEN,
 *     },
 *   ),
 * );
 * ```
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
  // eslint-disable-next-line deprecation/deprecation
  plugins.unshift(sentrySolidStartVite(options));

  return {
    ...config,
    plugins,
  };
};
