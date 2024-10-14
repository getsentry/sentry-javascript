import type { init as initNode } from '@sentry/node';
import type { SentryRollupPluginOptions } from '@sentry/rollup-plugin';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { init as initVue } from '@sentry/vue';

// Omitting 'app' as the Nuxt SDK will add the app instance in the client plugin (users do not have to provide this)
export type SentryNuxtClientOptions = Omit<Parameters<typeof initVue>[0] & object, 'app'>;
export type SentryNuxtServerOptions = Omit<Parameters<typeof initNode>[0] & object, 'app'>;

type SourceMapsOptions = {
  /**
   * If this flag is `true`, and an auth token is detected, the Sentry SDK will
   * automatically generate and upload source maps to Sentry during a production build.
   *
   * @default true
   */
  enabled?: boolean;

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
     * If this option is not specified, sensible defaults based on your adapter and nuxt.config.js
     * setup will be used. Use this option to override these defaults, for instance if you have a
     * customized build setup that diverges from Nuxt's defaults.
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
};

/**
 *  Build options for the Sentry module. These options are used during build-time by the Sentry SDK.
 */
export type SentryNuxtModuleOptions = {
  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   * These options are always read from the `sentry` module options in the `nuxt.config.(js|ts).
   * Do not define them in the `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
   */
  sourceMapsUploadOptions?: SourceMapsOptions;

  /**
   * Enable debug functionality of the SDK during build-time.
   * Enabling this will give you, for example, logs about source maps.
   */
  debug?: boolean;

  /**
   * Enabling basic server tracing can be used for environments where modifying the node option `--import` is not possible.
   * However, enabling this option only supports limited tracing instrumentation. Only http traces will be collected (but no database-specific traces etc.).
   *
   * If this option is `true`, the Sentry SDK will import the Sentry server config at the top of the server entry file to load the SDK on the server.
   *
   * **DO NOT** enable this option if you've already added the node option `--import` in your node start script. This would initialize Sentry twice on the server-side and leads to unexpected issues.
   *
   * @default false
   */
  experimental_basicServerTracing?: boolean;

  /**
   * Options to be passed directly to the Sentry Rollup Plugin (`@sentry/rollup-plugin`) and Sentry Vite Plugin (`@sentry/vite-plugin`) that ship with the Sentry Nuxt SDK.
   * You can use this option to override any options the SDK passes to the Vite (for Nuxt) and Rollup (for Nitro) plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   */
  unstable_sentryBundlerPluginOptions?: SentryRollupPluginOptions & SentryVitePluginOptions;
};
