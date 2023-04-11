import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';

import { makeCustomSentryVitePlugin } from './sourceMaps';

type SourceMapsUploadOptions = {
  /**
   * If this flag is `true`, the Sentry plugins will automatically upload source maps to Sentry.
   * Defaults to `true`.
   */
  autoUploadSourceMaps?: boolean;

  /**
   * Options for the Sentry Vite plugin to customize and override the release creation and source maps upload process.
   * See [Sentry Vite Plugin Options](https://github.com/getsentry/sentry-javascript-bundler-plugins/tree/main/packages/vite-plugin#configuration) for a detailed description.
   */
  sourceMapsUploadOptions?: Partial<SentryVitePluginOptions>;
};

export type SentrySvelteKitPluginOptions = {
  /**
   * If this flag is `true`, the Sentry plugins will log some useful debug information.
   * Defaults to `false`.
   */
  debug?: boolean;
} & SourceMapsUploadOptions;

const DEFAULT_PLUGIN_OPTIONS: SentrySvelteKitPluginOptions = {
  autoUploadSourceMaps: true,
  debug: false,
};

/**
 * Vite Plugins for the Sentry SvelteKit SDK, taking care of creating
 * Sentry releases and uploading source maps to Sentry.
 *
 * Sentry adds a few additional properties to your Vite config.
 * Make sure, it is registered before the SvelteKit plugin.
 */
export function sentryVite(options: SentrySvelteKitPluginOptions = {}): Plugin[] {
  const mergedOptions = {
    ...DEFAULT_PLUGIN_OPTIONS,
    ...options,
  };

  const sentryPlugins = [];

  if (mergedOptions.autoUploadSourceMaps) {
    const pluginOptions = {
      ...mergedOptions.sourceMapsUploadOptions,
      debug: mergedOptions.debug, // override the plugin's debug flag with the one from the top-level options
    };
    sentryPlugins.push(makeCustomSentryVitePlugin(pluginOptions));
  }

  return sentryPlugins;
}
