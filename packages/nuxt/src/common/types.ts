import type { init } from '@sentry/vue';

// Omitting 'app' as the Nuxt SDK will add the app instance in the client plugin (users do not have to provide this)
export type SentryNuxtOptions = Omit<Parameters<typeof init>[0] & object, 'app'>;

type SourceMapsOptions = {
  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   * These options are always read from the `sentry` module options in the `nuxt.config.(js|ts).
   * Do not define them in the `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
   */
  sourceMapsUploadOptions?: {
    /**
     * If this flag is `true`, and an auth token is detected, the Sentry integration will
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
};

/**
 *  Build options for the Sentry module. These options are used during build-time by the Sentry SDK.
 */
export type SentryNuxtModuleOptions = SourceMapsOptions & {
  /**
   * Enable debug functionality of the SDK during build-time.
   * Enabling this will give you, for example, logs about source maps.
   */
  debug?: boolean;
};
