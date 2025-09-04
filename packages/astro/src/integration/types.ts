import type { BuildTimeOptionsBase, UnstableVitePluginOptions } from '@sentry/core';
import type { SentryVitePluginOptions } from '@sentry/vite-plugin';
import type { RouteData } from 'astro';

type SdkInitPaths = {
  /**
   * Path to a `sentry.client.config.(js|ts)` file that contains a `Sentry.init` call.
   *
   * If this option is not specified, the default location (`<projectRoot>/sentry.client.config.(js|ts)`)
   * will be used to look up the config file.
   * If there is no file at the default location either, the SDK will initialize with the options
   * specified in the `sentryAstro` integration or with default options.
   */
  clientInitPath?: string;

  /**
   * Path to a `sentry.server.config.(js|ts)` file that contains a `Sentry.init` call.
   *
   * If this option is not specified, the default location (`<projectRoot>/sentry.server.config.(js|ts)`)
   * will be used to look up the config file.
   * If there is no file at the default location either, the SDK will initialize with the options
   * specified in the `sentryAstro` integration or with default options.
   */
  serverInitPath?: string;
};

/**
 * @deprecated Move these options to the top-level of your Sentry configuration.
 */
type SourceMapsOptions = {
  /**
   * If this flag is `true`, and an auth token is detected, the Sentry integration will
   * automatically generate and upload source maps to Sentry during a production build.
   *
   * @default true
   * @deprecated Use `sourcemaps.disable` instead (with inverted logic)
   */
  enabled?: boolean;

  /**
   * The auth token to use when uploading source maps to Sentry.
   *
   * Instead of specifying this option, you can also set the `SENTRY_AUTH_TOKEN` environment variable.
   *
   * To create an auth token, follow this guide:
   * @see https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens
   *
   * @deprecated Use top-level `authToken` option instead
   */
  authToken?: string;

  /**
   * The organization slug of your Sentry organization.
   * Instead of specifying this option, you can also set the `SENTRY_ORG` environment variable.
   *
   * @deprecated Use top-level `org` option instead
   */
  org?: string;

  /**
   * The project slug of your Sentry project.
   * Instead of specifying this option, you can also set the `SENTRY_PROJECT` environment variable.
   *
   * @deprecated Use top-level `project` option instead
   */
  project?: string;

  /**
   * If this flag is `true`, the Sentry plugin will collect some telemetry data and send it to Sentry.
   * It will not collect any sensitive or user-specific data.
   *
   * @default true
   * @deprecated Use top-level `telemetry` option instead
   */
  telemetry?: boolean;

  /**
   * A glob or an array of globs that specify the build artifacts and source maps that will be uploaded to Sentry.
   *
   * If this option is not specified, sensible defaults based on your `outDir`, `rootDir` and `adapter`
   * config will be used. Use this option to override these defaults, for instance if you have a
   * customized build setup that diverges from Astro's defaults.
   *
   * The globbing patterns must follow the implementation of the `glob` package.
   * @see https://www.npmjs.com/package/glob#glob-primer
   *
   * @deprecated Use `sourcemaps.assets` instead
   */
  assets?: string | Array<string>;

  /**
   * A glob or an array of globs that specifies the build artifacts that should be deleted after the artifact
   * upload to Sentry has been completed.
   *
   * @default [] - By default no files are deleted.
   *
   * The globbing patterns follow the implementation of the glob package. (https://www.npmjs.com/package/glob)
   *
   * @deprecated Use `sourcemaps.filesToDeleteAfterUpload` instead
   */
  filesToDeleteAfterUpload?: string | Array<string>;

  /**
   * Options to further customize the Sentry Vite Plugin (@sentry/vite-plugin) behavior directly.
   * Options specified in this object take precedence over all other options.
   *
   * @see https://www.npmjs.com/package/@sentry/vite-plugin/v/2.14.2#options which lists all available options.
   *
   * Warning: Options within this object are subject to change at any time.
   * We DO NOT guarantee semantic versioning for these options, meaning breaking
   * changes can occur at any time within a major SDK version.
   *
   * Furthermore, some options are untested with Astro specifically. Use with caution.
   *
   * @deprecated Use top-level `unstable_sentryVitePluginOptions` instead
   */
  unstable_sentryVitePluginOptions?: Partial<SentryVitePluginOptions>;
};

type InstrumentationOptions = {
  /**
   * Options for automatic instrumentation of your application.
   */
  autoInstrumentation?: {
    /**
     * If this flag is `true` and your application is configured for SSR (or hybrid) mode,
     * the Sentry integration will automatically add middleware to:
     *
     * - capture server performance data and spans for incoming server requests
     * - enable distributed tracing between server and client
     * - annotate server errors with more information
     *
     * This middleware will only be added automatically in Astro 3.5.0 and newer.
     * For older versions, add the `Sentry.handleRequest` middleware manually
     * in your `src/middleware.js` file.
     *
     * @default true in SSR/hybrid mode, false in SSG/static mode
     */
    requestHandler?: boolean;
  };
};

type SdkEnabledOptions = {
  /**
   * Controls if the Sentry SDK is enabled or not.
   *
   * You can either set a boolean value to enable/disable the SDK for both client and server,
   * or pass an object with `client` and `server` properties to enable/disable the SDK.
   *
   * If the SDK is disabled, no data will be caught or sent to Sentry. In this case, also no
   * Sentry code will be added to your bundle.
   *
   * @default true - the SDK is enabled by default for both, client and server.
   *
   */
  enabled?:
    | boolean
    | {
        client?: boolean;
        server?: boolean;
      };
};

/**
 * We accept aribtrary options that are passed through to the Sentry SDK.
 * This is not recommended and will stop working in a future version.
 * Note: Not all options are actually passed through, only a select subset:
 * release, environment, dsn, debug, sampleRate, tracesSampleRate, replaysSessionSampleRate, replaysOnErrorSampleRate
 * @deprecated This will be removed in a future major.
 **/
type DeprecatedRuntimeOptions = Record<string, unknown>;

/**
 * A subset of Sentry SDK options that can be set via the `sentryAstro` integration.
 * Some options (e.g. integrations) are set by default and cannot be changed here.
 *
 * If you want a more fine-grained control over the SDK, with all options,
 * you can call Sentry.init in `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
 *
 * If you specify a dedicated init file, the SDK options passed to `sentryAstro` will be ignored.
 */
export type SentryOptions = Omit<BuildTimeOptionsBase, 'release'> &
  // todo(v11): `release` and `debug` need to be removed from BuildTimeOptionsBase as it is currently conflicting with `DeprecatedRuntimeOptions`
  UnstableVitePluginOptions<SentryVitePluginOptions> &
  SdkInitPaths &
  InstrumentationOptions &
  SdkEnabledOptions & {
    /**
     * Options for the Sentry Vite plugin to customize the source maps upload process.
     *
     * These options are always read from the `sentryAstro` integration.
     * Do not define them in the `sentry.client.config.(js|ts)` or `sentry.server.config.(js|ts)` files.
     *
     * @deprecated This option was deprecated. Please move the options to the top-level configuration.
     * See the migration guide in the SourceMapsOptions type documentation.
     */
    // eslint-disable-next-line deprecation/deprecation
    sourceMapsUploadOptions?: SourceMapsOptions;
    // eslint-disable-next-line deprecation/deprecation
  } & DeprecatedRuntimeOptions;

/**
 * Routes inside 'astro:routes:resolved' hook (Astro v5+)
 *
 * Inline type for official `IntegrationResolvedRoute`.
 * The type includes more properties, but we only need some of them.
 *
 * @see https://github.com/withastro/astro/blob/04e60119afee668264a2ff6665c19a32150f4c91/packages/astro/src/types/public/integrations.ts#L287
 */
export type IntegrationResolvedRoute = {
  isPrerendered: RouteData['prerender'];
  pattern: RouteData['route'];
  patternRegex: RouteData['pattern'];
  segments: RouteData['segments'];
};

/**
 * Internal type for Astro routes, as we store an additional `patternCaseSensitive` property alongside the
 * lowercased parametrized `pattern` of each Astro route.
 */
export type ResolvedRouteWithCasedPattern = IntegrationResolvedRoute & {
  patternRegex: string; // RegEx gets stringified
  patternCaseSensitive: string;
};
