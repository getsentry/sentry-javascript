import type { BrowserOptions } from '@sentry/browser';
import type { Options } from '@sentry/types';

type SdkInitPaths = {
  /**
   * Path to a `sentry.client.config.(js|ts)` file that contains a `Sentry.init` call.
   *
   * If this option is not specified, the default location (`<projectRoot>/sentry.client.config.(js|ts)`)
   * will be used to look up the config file.
   * If there is no file at the default location either, the SDK will initalize with the options
   * specified in the `sentryAstro` integration or with default options.
   */
  clientInitPath?: string;

  /**
   * Path to a `sentry.server.config.(js|ts)` file that contains a `Sentry.init` call.
   *
   * If this option is not specified, the default location (`<projectRoot>/sentry.server.config.(js|ts)`)
   * will be used to look up the config file.
   * If there is no file at the default location either, the SDK will initalize with the options
   * specified in the `sentryAstro` integration or with default options.
   */
  serverInitPath?: string;
};

type SourceMapsOptions = {
  /**
   * Options for the Sentry Vite plugin to customize the source maps upload process.
   *
   * These options are always read from the `sentryAstro` integration.
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
  };
};

/**
 * A subset of Sentry SDK options that can be set via the `sentryAstro` integration.
 * Some options (e.g. integrations) are set by default and cannot be changed here.
 *
 * If you want a more fine-grained control over the SDK, with all options,
 * you can call Sentry.init in `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
 *
 * If you specify a dedicated init file, the SDK options passed to `sentryAstro` will be ignored.
 */
export type SentryOptions = SdkInitPaths &
  Pick<Options, 'dsn' | 'release' | 'environment' | 'sampleRate' | 'tracesSampleRate' | 'debug'> &
  Pick<BrowserOptions, 'replaysSessionSampleRate' | 'replaysOnErrorSampleRate'> &
  SourceMapsOptions;
