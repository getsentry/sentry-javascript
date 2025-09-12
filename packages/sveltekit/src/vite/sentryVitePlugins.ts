import type { Plugin } from 'vite';
import type { AutoInstrumentSelection } from './autoInstrument';
import { makeAutoInstrumentationPlugin } from './autoInstrument';
import { detectAdapter } from './detectAdapter';
import { makeGlobalValuesInjectionPlugin } from './injectGlobalValues';
import { makeCustomSentryVitePlugins } from './sourceMaps';
import { loadSvelteConfig } from './svelteConfig';
import type { CustomSentryVitePluginOptions, SentrySvelteKitPluginOptions } from './types';

const DEFAULT_PLUGIN_OPTIONS: SentrySvelteKitPluginOptions = {
  autoUploadSourceMaps: true,
  autoInstrument: true,
  debug: false,
};

/**
 * Vite Plugins for the Sentry SvelteKit SDK, taking care of creating
 * Sentry releases and uploading source maps to Sentry.
 *
 * Sentry adds a few additional properties to your Vite config.
 * Make sure, it is registered before the SvelteKit plugin.
 */
export async function sentrySvelteKit(options: SentrySvelteKitPluginOptions = {}): Promise<Plugin[]> {
  const mergedOptions = {
    ...DEFAULT_PLUGIN_OPTIONS,
    ...options,
    adapter: options.adapter || (await detectAdapter(options.debug)),
  };

  const svelteConfig = await loadSvelteConfig();

  const sentryPlugins: Plugin[] = [];

  if (mergedOptions.autoInstrument) {
    // TODO: Once tracing is promoted stable, we need to adjust this check!
    const kitTracingEnabled = !!svelteConfig.kit?.experimental?.tracing?.server;

    const pluginOptions: AutoInstrumentSelection = {
      load: true,
      serverLoad: true,
      ...(typeof mergedOptions.autoInstrument === 'object' ? mergedOptions.autoInstrument : {}),
    };

    sentryPlugins.push(
      makeAutoInstrumentationPlugin({
        ...pluginOptions,
        debug: options.debug || false,
        // if kit-internal tracing is enabled, we only want to wrap and instrument client-side code.
        onlyInstrumentClient: kitTracingEnabled,
      }),
    );
  }

  const sentryVitePluginsOptions = generateVitePluginOptions(mergedOptions);

  if (mergedOptions.autoUploadSourceMaps) {
    // When source maps are enabled, we need to inject the output directory to get a correct
    // stack trace, by using this SDK's `rewriteFrames` integration.
    // This integration picks up the value.
    // TODO: I don't think this is technically correct. Either we always or never inject the output directory.
    // Stack traces shouldn't be different, depending on source maps config. With debugIds, we might not even
    // need to rewrite frames anymore.
    sentryPlugins.push(await makeGlobalValuesInjectionPlugin(svelteConfig, mergedOptions));
  }

  if (sentryVitePluginsOptions) {
    const sentryVitePlugins = await makeCustomSentryVitePlugins(sentryVitePluginsOptions, svelteConfig);
    sentryPlugins.push(...sentryVitePlugins);
  }

  return sentryPlugins;
}

/**
 * This function creates the options for the custom Sentry Vite plugin.
 * The options are derived from the Sentry SvelteKit plugin options, where the `_unstable` options take precedence.
 *
 * only exported for testing
 */
export function generateVitePluginOptions(
  svelteKitPluginOptions: SentrySvelteKitPluginOptions,
): CustomSentryVitePluginOptions | null {
  let sentryVitePluginsOptions: CustomSentryVitePluginOptions | null = null;

  // Bundle Size Optimizations
  if (svelteKitPluginOptions.bundleSizeOptimizations) {
    sentryVitePluginsOptions = {
      bundleSizeOptimizations: {
        ...svelteKitPluginOptions.bundleSizeOptimizations,
      },
    };
  }

  // todo(v11): remove deprecated options (Also from options type)

  // Source Maps
  if (svelteKitPluginOptions.autoUploadSourceMaps && process.env.NODE_ENV !== 'development') {
    const {
      // eslint-disable-next-line deprecation/deprecation
      unstable_sentryVitePluginOptions: deprecated_unstableSourceMapUploadOptions,
      ...deprecatedSourceMapUploadOptions
      // eslint-disable-next-line deprecation/deprecation
    } = svelteKitPluginOptions.sourceMapsUploadOptions || {};

    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars,deprecation/deprecation
      sourceMapsUploadOptions: _filtered1,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      unstable_sentryVitePluginOptions: _filtered2,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      autoUploadSourceMaps: _filtered3,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      autoInstrument: _filtered4,
      sentryUrl,
      ...newSvelteKitPluginOptions
    } = svelteKitPluginOptions;

    const { unstable_sentryVitePluginOptions } = svelteKitPluginOptions;

    sentryVitePluginsOptions = {
      ...(sentryVitePluginsOptions ? sentryVitePluginsOptions : {}),

      ...deprecatedSourceMapUploadOptions,
      ...newSvelteKitPluginOptions,

      url: sentryUrl,

      ...deprecated_unstableSourceMapUploadOptions,
      ...unstable_sentryVitePluginOptions,

      adapter: svelteKitPluginOptions.adapter,
      // override the plugin's debug flag with the one from the top-level options
      debug: svelteKitPluginOptions.debug,
    };

    // Handle sourcemaps options - merge deprecated and new, with new taking precedence
    if (
      // eslint-disable-next-line deprecation/deprecation
      deprecatedSourceMapUploadOptions.sourcemaps ||
      svelteKitPluginOptions.sourcemaps ||
      deprecated_unstableSourceMapUploadOptions?.sourcemaps ||
      unstable_sentryVitePluginOptions?.sourcemaps
    ) {
      sentryVitePluginsOptions.sourcemaps = {
        // eslint-disable-next-line deprecation/deprecation
        ...deprecatedSourceMapUploadOptions.sourcemaps,
        ...svelteKitPluginOptions.sourcemaps,
        // Also handle nested deprecated options from unstable plugin options
        ...deprecated_unstableSourceMapUploadOptions?.sourcemaps,
        ...unstable_sentryVitePluginOptions?.sourcemaps,
      };
    }

    // Handle release options - merge deprecated and new, with new taking precedence
    if (
      // eslint-disable-next-line deprecation/deprecation
      deprecatedSourceMapUploadOptions.release ||
      svelteKitPluginOptions.release ||
      deprecated_unstableSourceMapUploadOptions?.release ||
      unstable_sentryVitePluginOptions?.release
    ) {
      sentryVitePluginsOptions.release = {
        // eslint-disable-next-line deprecation/deprecation
        ...deprecatedSourceMapUploadOptions.release,
        ...svelteKitPluginOptions.release,
        // Also handle nested deprecated options from unstable plugin options
        ...deprecated_unstableSourceMapUploadOptions?.release,
        ...unstable_sentryVitePluginOptions?.release,
      };
    }
  }

  return sentryVitePluginsOptions;
}
