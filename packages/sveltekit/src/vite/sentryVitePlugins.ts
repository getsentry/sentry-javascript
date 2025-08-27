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

  // Source Maps
  if (svelteKitPluginOptions.autoUploadSourceMaps && process.env.NODE_ENV !== 'development') {
    const { unstable_sentryVitePluginOptions, ...sourceMapsUploadOptions } =
      svelteKitPluginOptions.sourceMapsUploadOptions || {};

    sentryVitePluginsOptions = {
      ...(sentryVitePluginsOptions ? sentryVitePluginsOptions : {}),

      ...sourceMapsUploadOptions,
      ...unstable_sentryVitePluginOptions,
      adapter: svelteKitPluginOptions.adapter,
      // override the plugin's debug flag with the one from the top-level options
      debug: svelteKitPluginOptions.debug,
    };

    if (sentryVitePluginsOptions.sourcemaps) {
      sentryVitePluginsOptions.sourcemaps = {
        ...sourceMapsUploadOptions?.sourcemaps,
        ...unstable_sentryVitePluginOptions?.sourcemaps,
      };
    }

    if (sentryVitePluginsOptions.release) {
      sentryVitePluginsOptions.release = {
        ...sourceMapsUploadOptions?.release,
        ...unstable_sentryVitePluginOptions?.release,
      };
    }
  }

  return sentryVitePluginsOptions;
}
