import { getDisabledSourcemapsOptions } from '@sentry/bundler-plugins/core';
import { sentryVitePlugin } from '@sentry/bundler-plugins/vite';
import { resolveSourceMapsFeatures, stringifyForCodeInjection, warnOnRemovedBuildOptions } from '@sentry/core';
import type { Plugin, UserConfig } from 'vite';
import { makeBuildInstrumentationFilePlugin } from './buildInstrumentationFile';
import type { SourceMapState } from './sourceMaps';
import { makeAddSentryVitePlugin, makeEnableSourceMapsVitePlugin } from './sourceMaps';
import type { SentrySolidStartPluginOptions } from './types';

/**
 * Various Sentry vite plugins to be used for SolidStart.
 */
export const sentrySolidStartVite = (
  options: SentrySolidStartPluginOptions = {},
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
    sentryPlugins.push(makeBuildInstrumentationFilePlugin(options, tunnelBasePath));
  }

  if (process.env.NODE_ENV !== 'development') {
    // TODO(v12): Add the Sentry plugin with `sourcemaps.disable: true` too, like with the options that replace it.
    if (resolveSourceMapsFeatures(options.sourcemaps).legacyDisable !== true) {
      const sourceMapState: SourceMapState = { sdkEnabledSourceMaps: false };

      // The bundler plugin decides on the `build.sourcemap` it finds in its own `config` hook,
      // so the plugin that sets it has to come first.
      sentryPlugins.push(
        ...makeEnableSourceMapsVitePlugin(options, sourceMapState),
        ...makeAddSentryVitePlugin(options, sourceMapState, runtimeRelease),
      );
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
  plugins.unshift(sentrySolidStartVite(options, tunnelBasePath, runtimeRelease));

  return {
    ...config,
    plugins,
  };
};
