import type { Plugin } from 'vite';

import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { AutoInstrumentSelection } from './autoInstrument';
import { makeAutoInstrumentationPlugin } from './autoInstrument';
import type { SupportedSvelteKitAdapters } from './detectAdapter';
import { detectAdapter } from './detectAdapter';
import { makeCustomSentryVitePlugins } from './sourceMaps';

/**
 * Options related to source maps upload to Sentry
 */
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
  sourceMapsUploadOptions?: {
    /**
     * The auth token to use when uploading source maps to Sentry.
     *
     * Instead of specifying this option, you can also set the `SENTRY_AUTH_TOKEN` environment variable.
     *
     * To create an auth token, follow this guide:
     * @see https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens
     */
    authToken?: string;

    /**
     * The organization slug of your Sentry organization.
     * Instead of specifying this option, you can also set the `SENTRY_ORG` environment variable.
     */
    org?: string;

    /**
     * The project slug of your Sentry project.
     * Instead of specifying this option, you can also set the `SENTRY_PROJECT` environment variable.
     */
    project?: string;

    /**
     * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
     * It will not collect any sensitive or user-specific data.
     *
     * @default true
     */
    telemetry?: boolean;

    /**
     * Options related to sourcemaps
     */
    sourcemaps?: {
      /**
       * A glob or an array of globs that specify the build artifacts and source maps that will be uploaded to Sentry.
       *
       * If this option is not specified, sensible defaults based on your adapter and svelte.config.js
       * setup will be used. Use this option to override these defaults, for instance if you have a
       * customized build setup that diverges from SvelteKit's defaults.
       *
       * The globbing patterns must follow the implementation of the `glob` package.
       * @see https://www.npmjs.com/package/glob#glob-primer
       */
      assets?: string | Array<string>;

      /**
       * A glob or an array of globs that specifies which build artifacts should not be uploaded to Sentry.
       *
       * @default [] - By default no files are ignored. Thus, all files matching the `assets` glob
       * or the default value for `assets` are uploaded.
       *
       * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
       */
      ignore?: string | Array<string>;

      /**
       * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
       * upload to Sentry has been completed.
       *
       * @default [] - By default no files are deleted.
       *
       * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
       */
      filesToDeleteAfterUpload?: string | Array<string>;
    };

    /**
     * Options related to managing the Sentry releases for a build.
     *
     * Note: Managing releases is optional and not required for uploading source maps.
     */
    release?: {
      /**
       * Unique identifier for the release you want to create.
       * This value can also be specified via the SENTRY_RELEASE environment variable.
       *
       * Defaults to automatically detecting a value for your environment. This includes values for Cordova, Heroku,
       * AWS CodeBuild, CircleCI, Xcode, and Gradle, and otherwise uses the git HEAD's commit SHA (the latter requires
       * access to git CLI and for the root directory to be a valid repository).
       *
       * If you didn't provide a value and the plugin can't automatically detect one, no release will be created.
       */
      name?: string;

      /**
       * Whether the plugin should inject release information into the build for the SDK to pick it up when
       * sending events.
       *
       * Defaults to `true`.
       */
      inject?: boolean;
    };

    /**
     * Options to further customize the Sentry Vite Plugin (@sentry/vite-plugin) behavior directly.
     * Options specified in this object take precedence over the options specified in
     * the `sourcemaps` and `release` objects.
     *
     * @see https://www.npmjs.com/package/@sentry/vite-plugin/v/2.14.2#options which lists all available options.
     *
     * Warning: Options within this object are subject to change at any time.
     * We DO NOT guarantee semantic versioning for these options, meaning breaking
     * changes can occur at any time within a major SDK version.
     *
     * Furthermore, some options are untested with SvelteKit specifically. Use with caution.
     */
    unstable_sentryVitePluginOptions?: Partial<SentryVitePluginOptions>;
  };
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

  if (mergedOptions.autoUploadSourceMaps && process.env.NODE_ENV !== 'development') {
    const { unstable_sentryVitePluginOptions, ...sourceMapsUploadOptions } =
      mergedOptions.sourceMapsUploadOptions || {};

    const sentryVitePluginsOptions = {
      ...sourceMapsUploadOptions,

      ...unstable_sentryVitePluginOptions,

      adapter: mergedOptions.adapter,
      // override the plugin's debug flag with the one from the top-level options
      debug: mergedOptions.debug,
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

    const sentryVitePlugins = await makeCustomSentryVitePlugins(sentryVitePluginsOptions);

    sentryPlugins.push(...sentryVitePlugins);
  }

  return sentryPlugins;
}
