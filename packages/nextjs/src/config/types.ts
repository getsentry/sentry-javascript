import type { GLOBAL_OBJ } from '@sentry/core';
import type { SentryWebpackPluginOptions } from '@sentry/webpack-plugin';

// The first argument to `withSentryConfig` (which is the user's next config).
export type ExportedNextConfig = NextConfigObject | NextConfigFunction;

// Vendored from Next.js (this type is not complete - extend if necessary)
type NextRewrite = {
  source: string;
  destination: string;
};

interface WebpackPluginInstance {
  [index: string]: unknown;
  apply: (compiler: unknown) => void;
}

export type NextConfigObject = {
  // Custom webpack options
  webpack?: WebpackConfigFunction | null;
  // Whether to build serverless functions for all pages, not just API routes. Removed in nextjs 12+.
  target?: 'server' | 'experimental-serverless-trace';
  // The output directory for the built app (defaults to ".next")
  distDir?: string;
  // URL location of `_next/static` directory when hosted on a CDN
  assetPrefix?: string;
  // The root at which the nextjs app will be served (defaults to "/")
  basePath?: string;
  // Config which will be available at runtime
  publicRuntimeConfig?: { [key: string]: unknown };
  // File extensions that count as pages in the `pages/` directory
  pageExtensions?: string[];
  // Whether Next.js should do a static export
  output?: string;
  // Paths to reroute when requested
  rewrites?: () => Promise<
    | NextRewrite[]
    | {
        beforeFiles?: NextRewrite[];
        afterFiles?: NextRewrite[];
        fallback?: NextRewrite[];
      }
  >;
  // Next.js experimental options
  experimental?: {
    instrumentationHook?: boolean;
    clientTraceMetadata?: string[];
    serverComponentsExternalPackages?: string[]; // next < v15.0.0
  };
  productionBrowserSourceMaps?: boolean;
  // https://nextjs.org/docs/pages/api-reference/next-config-js/env
  env?: Record<string, string>;
  serverExternalPackages?: string[]; // next >= v15.0.0
  turbopack?: TurbopackOptions;
  compiler?: {
    runAfterProductionCompile?: (context: { distDir: string; projectDir: string }) => Promise<void> | void;
  };
};

export type SentryBuildWebpackOptions = {
  /**
   * Automatically instrument Next.js data fetching methods and Next.js API routes with error and performance monitoring.
   * Defaults to `true`.
   */
  autoInstrumentServerFunctions?: boolean;

  /**
   * Automatically instrument Next.js middleware with error and performance monitoring. Defaults to `true`.
   */
  autoInstrumentMiddleware?: boolean;

  /**
   * Automatically instrument components in the `app` directory with error monitoring. Defaults to `true`.
   */
  autoInstrumentAppDirectory?: boolean;

  /**
   * Automatically create cron monitors in Sentry for your Vercel Cron Jobs if configured via `vercel.json`.
   *
   * Defaults to `false`.
   */
  automaticVercelMonitors?: boolean;

  /**
   * Exclude certain serverside API routes or pages from being instrumented with Sentry during build-time. This option
   * takes an array of strings or regular expressions. This options also affects pages in the `app` directory.
   *
   * NOTE: Pages should be specified as routes (`/animals` or `/api/animals/[animalType]/habitat`), not filepaths
   * (`pages/animals/index.js` or `.\src\pages\api\animals\[animalType]\habitat.tsx`), and strings must be be a full,
   * exact match.
   *
   * Notice: If you build Next.js with turbopack, the Sentry SDK will no longer apply build-time instrumentation and
   * purely rely on Next.js telemetry features, meaning that this option will effectively no-op.
   */
  excludeServerRoutes?: Array<RegExp | string>;

  /**
   * Disables automatic injection of Sentry's Webpack configuration.
   *
   * By default, the Sentry Next.js SDK injects its own Webpack configuration to enable features such as
   * source map upload and automatic instrumentation. Set this option to `true` if you want to prevent
   * the SDK from modifying your Webpack config (for example, if you want to handle Sentry integration manually
   * or if you are on an older version of Next.js while using Turbopack).
   */
  disableSentryConfig?: boolean;

  /**
   * Tree-shaking options to help reduce the size of the Sentry SDK bundle.
   */
  treeshake?: {
    /**
     * Removes Sentry SDK logger statements from the bundle. Note that this doesn't affect Sentry Logs.
     */
    removeDebugLogging?: boolean;

    /**
     * Setting this to true will treeshake any SDK code that is related to tracing and performance monitoring.
     */
    removeTracing?: boolean;

    /**
     * Setting this flag to `true` will tree shake any SDK code related to capturing iframe content with Session Replay.
     * It's only relevant when using Session Replay. Enable this flag if you don't want to record any iframes.
     * This has no effect if you did not add `replayIntegration`.
     */
    excludeReplayIframe?: boolean;

    /**
     * Setting this flag to `true` will tree shake any SDK code related to capturing shadow dom elements with Session Replay.
     * It's only relevant when using Session Replay.
     * Enable this flag if you don't want to record any shadow DOM elements.
     * This has no effect if you did not add `replayIntegration`.
     */
    excludeReplayShadowDOM?: boolean;

    /**
     * Setting this flag to `true` will tree shake any SDK code that is related to the included compression web worker for Session Replay.
     * It's only relevant when using Session Replay.
     * Enable this flag if you want to host a compression worker yourself.
     * See Using a Custom Compression Worker for details.
     * We don't recommend enabling this flag unless you provide a custom worker URL.
     * This has no effect if you did not add `replayIntegration`.
     */
    excludeReplayCompressionWorker?: boolean;
  };

  /**
   * Options to be passed directly to the Sentry Webpack Plugin (`@sentry/webpack-plugin`) that ships with the Sentry SDK.
   * You can use this option to override any options the SDK passes to the Webpack plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   */
  unstable_sentryWebpackPluginOptions?: SentryWebpackPluginOptions;

  /**
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
   * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
   */
  reactComponentAnnotation?: {
    /**
     * Whether the component name annotate plugin should be enabled or not.
     */
    enabled?: boolean;

    /**
     * A list of strings representing the names of components to ignore. The plugin will not apply `data-sentry` annotations on the DOM element for these components.
     */
    ignoredComponents?: string[];
  };
};

export type SentryBuildOptions = {
  /**
   * The slug of the Sentry organization associated with the app.
   *
   * This value can also be specified via the `SENTRY_ORG` environment variable.
   */
  org?: string;

  /**
   * The slug of the Sentry project associated with the app.
   *
   * This value can also be specified via the `SENTRY_PROJECT` environment variable.
   */
  project?: string;

  /**
   * The authentication token to use for all communication with Sentry.
   * Can be obtained from https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/.
   *
   * This value can also be specified via the `SENTRY_AUTH_TOKEN` environment variable.
   */
  authToken?: string;

  /**
   * The base URL of your Sentry instance. Use this if you are using a self-hosted
   * or Sentry instance other than sentry.io.
   *
   * This value can also be set via the `SENTRY_URL` environment variable.
   *
   * Defaults to https://sentry.io/, which is the correct value for SaaS customers.
   */
  sentryUrl?: string;

  /**
   * Headers added to every outgoing network request.
   */
  headers?: Record<string, string>;

  /**
   * If set to true, internal plugin errors and performance data will be sent to Sentry.
   *
   * At Sentry we like to use Sentry ourselves to deliver faster and more stable products.
   * We're very careful of what we're sending. We won't collect anything other than error
   * and high-level performance data. We will never collect your code or any details of the
   * projects in which you're using this plugin.
   *
   * Defaults to `true`.
   */
  telemetry?: boolean;

  /**
   * Suppresses all Sentry SDK build logs.
   *
   * Defaults to `false`.
   */
  // TODO: Actually implement this for the non-plugin code.
  silent?: boolean;

  /**
   * Prints additional debug information about the SDK and uploading source maps when building the application.
   *
   * Defaults to `false`.
   */
  // TODO: Actually implement this for the non-plugin code.
  debug?: boolean;

  /**
   * Options for source maps uploading.
   */
  sourcemaps?: {
    /**
     * Disable any functionality related to source maps.
     */
    disable?: boolean;

    /**
     * A glob or an array of globs that specifies the build artifacts that should be uploaded to Sentry.
     *
     * If this option is not specified, the plugin will try to upload all JavaScript files and source map files that are created during build.
     *
     * The globbing patterns follow the implementation of the `glob` package. (https://www.npmjs.com/package/glob)
     *
     * Use the `debug` option to print information about which files end up being uploaded.
     */
    assets?: string | string[];

    /**
     * A glob or an array of globs that specifies which build artifacts should not be uploaded to Sentry.
     *
     * The SDK automatically ignores Next.js internal files that don't have source maps (such as manifest files)
     * to prevent "Could not determine source map" warnings. Your custom patterns are merged with these defaults.
     *
     * The globbing patterns follow the implementation of the `glob` package. (https://www.npmjs.com/package/glob)
     *
     * Use the `debug` option to print information about which files end up being uploaded.
     */
    ignore?: string | string[];

    /**
     * Toggle whether generated source maps within your Next.js build folder should be automatically deleted after being uploaded to Sentry.
     *
     * Defaults to `true`.
     */
    deleteSourcemapsAfterUpload?: boolean;
  };

  /**
   * Options related to managing the Sentry releases for a build.
   *
   * More info: https://docs.sentry.io/product/releases/
   */
  release?: {
    /**
     * Unique identifier for the release you want to create.
     *
     * This value can also be specified via the `SENTRY_RELEASE` environment variable.
     *
     * Defaults to automatically detecting a value for your environment.
     * This includes values for Cordova, Heroku, AWS CodeBuild, CircleCI, Xcode, and Gradle, and otherwise uses the git `HEAD`'s commit SHA.
     * (the latter requires access to git CLI and for the root directory to be a valid repository)
     *
     * If you didn't provide a value and the plugin can't automatically detect one, no release will be created.
     */
    name?: string;

    /**
     * Whether the plugin should create a release on Sentry during the build.
     * Note that a release may still appear in Sentry even if this is value is `false` because any Sentry event that has a release value attached will automatically create a release.
     * (for example via the `inject` option)
     *
     * Defaults to `true`.
     */
    create?: boolean;

    /**
     * Whether the Sentry release should be automatically finalized (meaning an end timestamp is added) after the build ends.
     *
     * Defaults to `true`.
     */
    finalize?: boolean;

    /**
     * Unique identifier for the distribution, used to further segment your release.
     * Usually your build number.
     */
    dist?: string;

    /**
     * Version control system remote name.
     *
     * This value can also be specified via the `SENTRY_VSC_REMOTE` environment variable.
     *
     * Defaults to 'origin'.
     */
    vcsRemote?: string;

    /**
     * Associates the release with its commits in Sentry.
     */
    setCommits?: (
      | {
          /**
           * Automatically sets `commit` and `previousCommit`. Sets `commit` to `HEAD`
           * and `previousCommit` as described in the option's documentation.
           *
           * If you set this to `true`, manually specified `commit` and `previousCommit`
           * options will be overridden. It is best to not specify them at all if you
           * set this option to `true`.
           */
          auto: true;

          repo?: undefined;
          commit?: undefined;
        }
      | {
          auto?: false | undefined;

          /**
           * The full repo name as defined in Sentry.
           *
           * Required if the `auto` option is not set to `true`.
           */
          repo: string;

          /**
           * The current (last) commit in the release.
           *
           * Required if the `auto` option is not set to `true`.
           */
          commit: string;
        }
    ) & {
      /**
       * The commit before the beginning of this release (in other words,
       * the last commit of the previous release).
       *
       * Defaults to the last commit of the previous release in Sentry.
       *
       * If there was no previous release, the last 10 commits will be used.
       */
      previousCommit?: string;

      /**
       * If the flag is to `true` and the previous release commit was not found
       * in the repository, the plugin creates a release with the default commits
       * count instead of failing the command.
       *
       * Defaults to `false`.
       */
      ignoreMissing?: boolean;

      /**
       * If this flag is set, the setCommits step will not fail and just exit
       * silently if no new commits for a given release have been found.
       *
       * Defaults to `false`.
       */
      ignoreEmpty?: boolean;
    };

    /**
     * Adds deployment information to the release in Sentry.
     */
    deploy?: {
      /**
       * Environment for this release. Values that make sense here would
       * be `production` or `staging`.
       */
      env: string;

      /**
       * Deployment start time in Unix timestamp (in seconds) or ISO 8601 format.
       */
      started?: number | string;

      /**
       * Deployment finish time in Unix timestamp (in seconds) or ISO 8601 format.
       */
      finished?: number | string;

      /**
       * Deployment duration (in seconds). Can be used instead of started and finished.
       */
      time?: number;

      /**
       * Human readable name for the deployment.
       */
      name?: string;

      /**
       * URL that points to the deployment.
       */
      url?: string;
    };
  };

  /**
   * Options to configure various bundle size optimizations related to the Sentry SDK.
   */
  bundleSizeOptimizations?: {
    /**
     * If set to `true`, the Sentry SDK will attempt to treeshake (remove) any debugging code within itself during the build.
     * Note that the success of this depends on tree shaking being enabled in your build tooling.
     *
     * Setting this option to `true` will disable features like the SDK's `debug` option.
     */
    excludeDebugStatements?: boolean;

    /**
     * If set to `true`, the Sentry SDK will attempt to treeshake (remove) code within itself that is related to tracing and performance monitoring.
     * Note that the success of this depends on tree shaking being enabled in your build tooling.
     * **Notice:** Do not enable this when you're using any performance monitoring-related SDK features (e.g. `Sentry.startTransaction()`).
     */
    excludeTracing?: boolean;

    /**
     * If set to `true`, the Sentry SDK will attempt to treeshake (remove) code related to the SDK's Session Replay Shadow DOM recording functionality.
     * Note that the success of this depends on tree shaking being enabled in your build tooling.
     *
     * This option is safe to be used when you do not want to capture any Shadow DOM activity via Sentry Session Replay.
     */
    excludeReplayShadowDom?: boolean;

    /**
     * If set to `true`, the Sentry SDK will attempt to treeshake (remove) code related to the SDK's Session Replay `iframe` recording functionality.
     * Note that the success of this depends on tree shaking being enabled in your build tooling.
     *
     * You can safely do this when you do not want to capture any `iframe` activity via Sentry Session Replay.
     */
    excludeReplayIframe?: boolean;

    /**
     * If set to `true`, the Sentry SDK will attempt to treeshake (remove) code related to the SDK's Session Replay's Compression Web Worker.
     * Note that the success of this depends on tree shaking being enabled in your build tooling.
     *
     * **Notice:** You should only use this option if you manually host a compression worker and configure it in your Sentry Session Replay integration config via the `workerUrl` option.
     */
    excludeReplayWorker?: boolean;
  };

  /**
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
   * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
   *
   * @deprecated Use `webpack.reactComponentAnnotation` instead.
   */
  reactComponentAnnotation?: {
    /**
     * Whether the component name annotate plugin should be enabled or not.
     */
    enabled?: boolean;

    /**
     * A list of strings representing the names of components to ignore. The plugin will not apply `data-sentry` annotations on the DOM element for these components.
     */
    ignoredComponents?: string[];
  }; // TODO(v11): remove this option

  /**
   * Options to be passed directly to the Sentry Webpack Plugin (`@sentry/webpack-plugin`) that ships with the Sentry Next.js SDK.
   * You can use this option to override any options the SDK passes to the webpack plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   * @deprecated Use `webpack.unstable_sentryWebpackPluginOptions` instead.
   */
  unstable_sentryWebpackPluginOptions?: SentryWebpackPluginOptions; // TODO(v11): remove this option

  /**
   * Include Next.js-internal code and code from dependencies when uploading source maps.
   *
   * Note: Enabling this option can lead to longer build times.
   * Disabling this option will leave you without readable stacktraces for dependencies and Next.js-internal code.
   *
   * Defaults to `false`.
   *
   * This option applies to both webpack and turbopack builds.
   */
  // Enabling this option may upload a lot of source maps and since the sourcemap upload endpoint in Sentry is super
  // slow we don't enable it by default so that we don't opaquely increase build times for users.
  // TODO: Add an alias to this function called "uploadSourceMapsForDependencies"
  widenClientFileUpload?: boolean;

  /**
   * Automatically instrument Next.js data fetching methods and Next.js API routes with error and performance monitoring.
   * Defaults to `true`.
   * @deprecated Use `webpack.autoInstrumentServerFunctions` instead.
   */
  autoInstrumentServerFunctions?: boolean; // TODO(v11): remove this option

  /**
   * Automatically instrument Next.js middleware with error and performance monitoring. Defaults to `true`.
   * @deprecated Use `webpack.autoInstrumentMiddleware` instead.
   */
  autoInstrumentMiddleware?: boolean; // TODO(v11): remove this option

  /**
   * Automatically instrument components in the `app` directory with error monitoring. Defaults to `true`.
   * @deprecated Use `webpack.autoInstrumentAppDirectory` instead.
   */
  autoInstrumentAppDirectory?: boolean; // TODO(v11): remove this option

  /**
   * Exclude certain serverside API routes or pages from being instrumented with Sentry during build-time. This option
   * takes an array of strings or regular expressions. This options also affects pages in the `app` directory.
   *
   * NOTE: Pages should be specified as routes (`/animals` or `/api/animals/[animalType]/habitat`), not filepaths
   * (`pages/animals/index.js` or `.\src\pages\api\animals\[animalType]\habitat.tsx`), and strings must be be a full,
   * exact match.
   *
   * Notice: If you build Next.js with turbopack, the Sentry SDK will no longer apply build-time instrumentation and
   * purely rely on Next.js telemetry features, meaning that this option will effectively no-op.
   *
   * @deprecated Use `webpack.excludeServerRoutes` instead.
   */
  excludeServerRoutes?: Array<RegExp | string>;

  /**
   * Tunnel Sentry requests through this route on the Next.js server, to circumvent ad-blockers blocking Sentry events
   * from being sent. This option should be a path (for example: '/error-monitoring').
   *
   * - Pass `true` to auto-generate a random, ad-blocker-resistant route for each build
   * - Pass a string path (e.g., '/monitoring') to use a custom route
   *
   * NOTE: This feature only works with Next.js 11+
   */
  tunnelRoute?: string | boolean;

  /**
   * Tree shakes Sentry SDK logger statements from the bundle.
   *
   * @deprecated Use `webpack.treeshake.removeDebugLogging` instead.
   */
  disableLogger?: boolean; // TODO(v11): remove this option

  /**
   * Automatically create cron monitors in Sentry for your Vercel Cron Jobs if configured via `vercel.json`.
   *
   * Defaults to `false`.
   *
   * @deprecated Use `webpack.automaticVercelMonitors` instead.
   */
  automaticVercelMonitors?: boolean; // TODO(v11): remove this option

  /**
   * When an error occurs during release creation or sourcemaps upload, the plugin will call this function.
   *
   * By default, the plugin will simply throw an error, thereby stopping the bundling process.
   * If an `errorHandler` callback is provided, compilation will continue, unless an error is
   * thrown in the provided callback.
   *
   * To allow compilation to continue but still emit a warning, set this option to the following:
   *
   * ```js
   * (err) => {
   *   console.warn(err);
   * }
   * ```
   */
  errorHandler?: (err: Error) => void;

  /**
   * Suppress the warning about the `onRouterTransitionStart` hook.
   */
  suppressOnRouterTransitionStartWarning?: boolean;

  /**
   * Disables automatic injection of the route manifest into the client bundle.
   *
   * @deprecated Use `routeManifestInjection: false` instead.
   *
   * @default false
   */
  disableManifestInjection?: boolean; // TODO(v11): remove this option

  /**
   * Options for the route manifest injection feature.
   *
   * The route manifest is a build-time generated mapping of your Next.js App Router
   * routes that enables Sentry to group transactions by parameterized route names
   * (e.g., `/users/:id` instead of `/users/123`, `/users/456`, etc.).
   *
   * Set to `false` to disable route manifest injection entirely.
   *
   * @example
   * ```js
   * // Disable route manifest injection
   * routeManifestInjection: false
   *
   * // Exclude specific routes
   * routeManifestInjection: {
   *   exclude: [
   *     '/admin',           // Exact match
   *     /^\/internal\//,    // Regex: all routes starting with /internal/
   *     /\/secret-/,        // Regex: any route containing /secret-
   *   ]
   * }
   *
   * // Exclude using a function
   * routeManifestInjection: {
   *   exclude: (route) => route.includes('hidden')
   * }
   * ```
   */
  routeManifestInjection?:
    | false
    | {
        /**
         * Exclude specific routes from the route manifest.
         *
         * Use this option to prevent certain routes from being included in the client bundle's
         * route manifest. This is useful for:
         * - Hiding confidential or unreleased feature routes
         * - Excluding internal/admin routes you don't want exposed
         * - Reducing bundle size by omitting rarely-used routes
         *
         * Can be specified as:
         * - An array of strings (exact match) or RegExp patterns
         * - A function that receives a route path and returns `true` to exclude it
         */
        exclude?: Array<string | RegExp> | ((route: string) => boolean);
      };

  /**
   * Disables automatic injection of Sentry's Webpack configuration.
   *
   * By default, the Sentry Next.js SDK injects its own Webpack configuration to enable features such as
   * source map upload and automatic instrumentation. Set this option to `true` if you want to prevent
   * the SDK from modifying your Webpack config (for example, if you want to handle Sentry integration manually
   * or if you are on an older version of Next.js while using Turbopack).
   *
   * @deprecated Use `webpack.disableSentryConfig` instead.
   *
   * @default false
   */
  disableSentryWebpackConfig?: boolean; // TODO(v11): remove this option

  /**
   * When true (and Next.js >= 15), use the runAfterProductionCompile hook to consolidate sourcemap uploads
   * into a single operation after builds complete, reducing build time.
   *
   * When false, use the traditional approach of uploading sourcemaps during each webpack build. For Turbopack no sourcemaps will be uploaded.
   *
   * @default true for Turbopack, false for Webpack
   */
  useRunAfterProductionCompileHook?: boolean;

  /**
   * Contains a set of experimental flags that might change in future releases. These flags enable
   * features that are still in development and may be modified, renamed, or removed without notice.
   * Use with caution in production environments.
   */
  _experimental?: Partial<{
    thirdPartyOriginStackFrames?: boolean;
  }>;

  /**
   * Options related to webpack builds, has no effect if you are using Turbopack.
   */
  webpack?: SentryBuildWebpackOptions;
};

export type NextConfigFunction = (
  phase: string,
  defaults: { defaultConfig: NextConfigObject },
) => NextConfigObject | PromiseLike<NextConfigObject>;

/**
 * Webpack config
 */

// Note: The interface for `ignoreWarnings` is larger but we only need this. See https://webpack.js.org/configuration/other-options/#ignorewarnings
export type IgnoreWarningsOption = (
  | { module?: RegExp; message?: RegExp }
  | ((
      webpackError: {
        module?: {
          readableIdentifier: (requestShortener: unknown) => string;
        };
        message: string;
      },
      compilation: {
        requestShortener: unknown;
      },
    ) => boolean)
)[];

// The two possible formats for providing custom webpack config in `next.config.js`
export type WebpackConfigFunction = (config: WebpackConfigObject, options: BuildContext) => WebpackConfigObject;
export type WebpackConfigObject = {
  devtool?: string | boolean;
  plugins?: Array<WebpackPluginInstance>;
  entry: WebpackEntryProperty;
  output: { filename: string; path: string };
  target: string;
  context: string;
  ignoreWarnings?: IgnoreWarningsOption;
  resolve?: {
    modules?: string[];
    alias?: { [key: string]: string | boolean };
  };
  module?: {
    rules: Array<WebpackModuleRule>;
  };
} & {
  // Other webpack options
  [key: string]: unknown;
};

// A convenience type to save us from having to assert the existence of `module.rules` over and over
export type WebpackConfigObjectWithModuleRules = WebpackConfigObject & Required<Pick<WebpackConfigObject, 'module'>>;

// Information about the current build environment
export type BuildContext = {
  dev: boolean;
  isServer: boolean;
  buildId: string;
  dir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
  webpack: {
    version: string;
    DefinePlugin: new (values: Record<string, string | boolean>) => WebpackPluginInstance;
    ProvidePlugin: new (values: Record<string, string | string[]>) => WebpackPluginInstance;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultLoaders: any; // needed for type tests (test:types)
  totalPages: number; // needed for type tests (test:types)
  nextRuntime?: 'nodejs' | 'edge'; // Added in Next.js 12+
};

/**
 * Webpack `entry` config
 */

// For our purposes, the value for `entry` is either an object, or an async function which returns such an object
export type WebpackEntryProperty = EntryPropertyObject | EntryPropertyFunction;

export type EntryPropertyObject = {
  [key: string]: EntryPointValue;
};

export type EntryPropertyFunction = () => Promise<EntryPropertyObject>;

// Each value in that object is either a string representing a single entry point, an array of such strings, or an
// object containing either of those, along with other configuration options. In that third case, the entry point(s) are
// listed under the key `import`.
export type EntryPointValue = string | Array<string> | EntryPointObject;
export type EntryPointObject = { import: string | Array<string> };

/**
 * Webpack `module.rules` entry
 */

export type WebpackModuleRule = {
  test?: string | RegExp | ((resourcePath: string) => boolean);
  include?: Array<string | RegExp> | RegExp;
  exclude?: (filepath: string) => boolean;
  use?: ModuleRuleUseProperty | Array<ModuleRuleUseProperty>;
  oneOf?: Array<WebpackModuleRule>;
};

export type ModuleRuleUseProperty = {
  loader?: string;
  options?: Record<string, unknown>;
};

/**
 * Global with values we add when we inject code into people's pages, for use at runtime.
 */
export type EnhancedGlobal = typeof GLOBAL_OBJ & {
  _sentryRewriteFramesDistDir?: string;
  SENTRY_RELEASE?: { id: string };
  SENTRY_RELEASES?: { [key: string]: { id: string } };
};

export type JSONValue = string | number | boolean | JSONValue[] | { [k: string]: JSONValue };

type TurbopackLoaderItem =
  | string
  | {
      loader: string;
      // At the moment, Turbopack options must be JSON-serializable, so restrict values.
      options: Record<string, JSONValue>;
    };

type TurbopackRuleCondition = {
  path: string | RegExp;
};

export type TurbopackRuleConfigItemOrShortcut = TurbopackLoaderItem[] | TurbopackRuleConfigItem;

export type TurbopackMatcherWithRule = {
  matcher: string;
  rule: TurbopackRuleConfigItemOrShortcut;
};

type TurbopackRuleConfigItemOptions = {
  loaders: TurbopackLoaderItem[];
  as?: string;
};

type TurbopackRuleConfigItem =
  | TurbopackRuleConfigItemOptions
  | { [condition: string]: TurbopackRuleConfigItem }
  | false;

export interface TurbopackOptions {
  resolveAlias?: Record<string, string | string[] | Record<string, string | string[]>>;
  resolveExtensions?: string[];
  rules?: Record<string, TurbopackRuleConfigItemOrShortcut>;
  conditions?: Record<string, TurbopackRuleCondition>;
  moduleIds?: 'named' | 'deterministic';
  root?: string;
  debugIds?: boolean;
}
