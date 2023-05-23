import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { Plugin } from 'vite';

import type { AutoInstrumentSelection } from './autoInstrument';
import { makeAutoInstrumentationPlugin } from './autoInstrument';
import type { SupportedSvelteKitAdapters } from './detectAdapter';
import { detectAdapter } from './detectAdapter';
import { makeCustomSentryVitePlugin } from './sourceMaps';

type SourceMapsUploadOptions = {
  /**
   * If this flag is `true`, the Sentry plugins will automatically upload source maps to Sentry.
   * @default true`.
   */
  autoUploadSourceMaps?: boolean;

  /**
   * Options for the Sentry Vite plugin to customize and override the release creation and source maps upload process.
   * See [Sentry Vite Plugin Options](https://github.com/getsentry/sentry-javascript-bundler-plugins/tree/main/packages/vite-plugin#configuration) for a detailed description.
   */
  sourceMapsUploadOptions?: Partial<SentryVitePluginOptions>;
};

type AutoInstrumentOptions = {
  /**
   * The Sentry plugin will automatically instrument certain parts of your SvelteKit application at build time.
   * Set this option to `false` to disable this behavior or what is instrumentated by passing an object.
   *
   * Auto instrumentation includes:
   * - Universal `load` functions in `+page.(js|ts)` files
   * - Server-only `load` functions in `+page.server.(js|ts)` files
   *
   * @default true (meaning, the plugin will instrument all of the above)
   */
  autoInstrument?: boolean | AutoInstrumentSelection;
};

export type SentrySvelteKitPluginOptions = {
  /**
   * If this flag is `true`, the Sentry plugins will log some useful debug information.
   * @default false.
   */
  debug?: boolean;

  /**
   * Specify which SvelteKit adapter you're using.
   * By default, the SDK will attempt auto-detect the used adapter at build time and apply the
   * correct config for source maps upload or auto-instrumentation.
   *
   * Currently, the SDK supports the following adapters:
   * - node (@sveltejs/adapter-node)
   * - auto (@sveltejs/adapter-auto) only Vercel
   * - vercel (@sveltejs/adapter-auto) only Serverless functions, no edge runtime
   *
   * Set this option, if the SDK detects the wrong adapter or you want to use an adapter
   * that is not in this list. If you specify 'other', you'll most likely need to configure
   * source maps upload yourself.
   *
   * @default {} the SDK attempts to auto-detect the used adapter at build time
   */
  adapter?: SupportedSvelteKitAdapters;
} & SourceMapsUploadOptions &
  AutoInstrumentOptions;

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

  if (mergedOptions.autoUploadSourceMaps && process.env.NODE_ENV !== 'development') {
    // TODO: pass to makeCosutmSentryVitePlugin
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const adapter = mergedOptions.adapter || (await detectAdapter());

    const pluginOptions = {
      ...mergedOptions.sourceMapsUploadOptions,
      debug: mergedOptions.debug, // override the plugin's debug flag with the one from the top-level options
    };
    sentryPlugins.push(await makeCustomSentryVitePlugin(pluginOptions));
  }

  return sentryPlugins;
}
