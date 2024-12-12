import { dropUndefinedKeys } from '@sentry/core';
import type { Plugin } from 'vite';
import type { AutoInstrumentSelection } from './autoInstrument';
import { makeAutoInstrumentationPlugin } from './autoInstrument';
import { detectAdapter } from './detectAdapter';
import { makeCustomSentryVitePlugins } from './sourceMaps';
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

  const sentryPlugins: Plugin[] = [];

  if (mergedOptions.autoInstrument) {
    const pluginOptions: AutoInstrumentSelection = {
      load: true,
      serverLoad: true,
      ...(typeof mergedOptions.autoInstrument === 'object' ? mergedOptions.autoInstrument : {}),
    };

    sentryPlugins.push(
      makeAutoInstrumentationPlugin({
        ...pluginOptions,
        debug: options.debug || false,
      }),
    );
  }

  const sentryVitePluginsOptions = generateVitePluginOptions(mergedOptions);

  if (sentryVitePluginsOptions) {
    const sentryVitePlugins = await makeCustomSentryVitePlugins(sentryVitePluginsOptions);

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

  return dropUndefinedKeys(sentryVitePluginsOptions);
}
