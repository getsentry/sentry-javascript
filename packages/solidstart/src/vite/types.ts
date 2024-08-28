import type { SentryVitePluginOptions } from '@sentry/vite-plugin';

export type SourceMapsOptions = {
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
   * Options to further customize the Sentry Vite Plugin (@sentry/vite-plugin) behavior directly.
   * Options specified in this object take precedence over the options specified in
   * the `sourcemaps` and `release` objects.
   *
   * @see https://www.npmjs.com/package/@sentry/vite-plugin/v/2.22.2#options which lists all available options.
   *
   * Warning: Options within this object are subject to change at any time.
   * We DO NOT guarantee semantic versioning for these options, meaning breaking
   * changes can occur at any time within a major SDK version.
   *
   * Furthermore, some options are untested with SvelteKit specifically. Use with caution.
   */
  unstable_sentryVitePluginOptions?: Partial<SentryVitePluginOptions>;

  /**
   * Enable debug functionality of the SDK during build-time.
   * Enabling this will give you logs about source maps.
   */
  debug?: boolean;
};

/**
 *  Build options for the Sentry module. These options are used during build-time by the Sentry SDK.
 */
export type SentrySolidStartPluginOptions = {
  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   */
  sourceMapsUploadOptions?: SourceMapsOptions;

  /**
   * Enable debug functionality of the SDK during build-time.
   * Enabling this will give you, for example logs about source maps.
   */
  debug?: boolean;
};
