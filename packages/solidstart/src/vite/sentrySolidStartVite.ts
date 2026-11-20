import { getDisabledSourcemapsOptions } from '@sentry/bundler-plugins/core';
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { stringifyForCodeInjection, warnOnRemovedBuildOptions } from '@sentry/core';
import type { Plugin, UserConfig } from 'vite';
import { makeBuildInstrumentationFilePlugin } from './buildInstrumentationFile';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * Various Sentry vite plugins to be used for SolidStart.
 */
export const sentrySolidStartVite = (
  options: SentrySolidStartPluginOptions = {},
  viteConfig: UserConfig,
  tunnelBasePath = '',
  runtimeRelease?: string,
): Plugin[] => {
  warnOnRemovedBuildOptions(options, ['unstable_sentryVitePluginOptions']);

  const sentryPlugins: Plugin[] = [
    {
      name: 'sentry-solidstart-tunnel-base-path',
      // Serves the browser's managed tunnel under `server.baseURL`, like every other route of the app.
      config: () => ({
        define: { __SENTRY_SOLIDSTART_TUNNEL_BASE_PATH__: stringifyForCodeInjection(tunnelBasePath) },
      }),
    },
  ];

  if (options.autoInjectServerSentry !== 'experimental_dynamic-import') {
    sentryPlugins.push(makeBuildInstrumentationFilePlugin(options));
  }

  if (process.env.NODE_ENV !== 'development') {
    if (options.sourcemaps?.disable !== true) {
      const sourceMapsPlugin = makeAddSentryVitePlugin(options, viteConfig, runtimeRelease);
      const enableSourceMapsPlugin = makeEnableSourceMapsVitePlugin(options);

      sentryPlugins.push(...sourceMapsPlugin, ...enableSourceMapsPlugin);
    } else {
      // TODO: Revisit which features the plugin should run when source maps are off. For now it only injects module
      // versions, so `modulesIntegration` reports them when `node_modules` is missing at runtime.
      sentryPlugins.push(...sentryVitePlugin(getDisabledSourcemapsOptions({ debug: options.debug })));
    }
  }

  return sentryPlugins;
};

/**
 * Helper to add the Sentry SolidStart vite plugin to a vite config.
 */
export const addSentryPluginToVite = (
  config: UserConfig = {},
  options: SentrySolidStartPluginOptions,
  tunnelBasePath?: string,
  runtimeRelease?: string,
): UserConfig => {
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  plugins.unshift(sentrySolidStartVite(options, config, tunnelBasePath, runtimeRelease));

  return {
    ...config,
    plugins,
  };
};
