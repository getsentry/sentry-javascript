import type {
  BuildTimeOptionsBase,
  GLOBAL_OBJ,
  ModuleMetadata,
  ModuleMetadataCallback,
  ReactComponentAnnotationOptions,
} from '@sentry/core';

// The first argument to `withSentryConfig` (which is the user's next config).
export type ExportedNextConfig = NextConfigObject | NextConfigFunction;

// Vendored from Next.js (this type is not complete - extend if necessary)
type NextRewrite = {
  source: string;
  destination: string;
};

export interface WebpackPluginInstance {
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
  cacheComponents?: boolean;
  // Next.js experimental options
  experimental?: {
    instrumentationHook?: boolean;
    clientTraceMetadata?: string[];
    serverComponentsExternalPackages?: string[]; // next < v15.0.0
    sri?: { algorithm?: string };
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
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.
   * Please note that this feature is not currently supported by the esbuild bundler plugins, and will only annotate React components
   *
   * @deprecated Use the top-level `reactComponentAnnotation` option instead, which works for both webpack and Turbopack builds.
   */
  reactComponentAnnotation?: ReactComponentAnnotationOptions; // TODO(v12): remove this option
};

// TODO: `silent` is only forwarded to the bundler plugin - the SDK's own build-time logging ignores it.
/**
 * Build-time options for the Sentry Next.js SDK, passed as the second argument to `withSentryConfig`.
 *
 * This builds on {@link BuildTimeOptionsBase}, the option set shared across Sentry's meta-framework
 * SDKs. Options are only overridden below where Next.js genuinely deviates — either in shape
 * (`project`, `sourcemaps`, `release`) or in behavior that differs between webpack and Turbopack.
 */
export type SentryBuildOptions = Omit<
  BuildTimeOptionsBase,
  'project' | 'sourcemaps' | 'release' | 'buildTimeInstrumentation' | 'applicationKey' | 'moduleMetadata'
> & {
  /**
   * The slug of the Sentry project associated with the app.
   *
   * Multiple projects can be passed to upload the build's source maps to each of them.
   *
   * This value can also be specified via the `SENTRY_PROJECT` environment variable.
   */
  project?: string | string[];

  /**
   * Options for source maps uploading.
   */
  sourcemaps?: SentryBuildSourceMapsOptions;

  /**
   * Options related to managing the Sentry releases for a build.
   *
   * Note that `release.inject` is not configurable. The Next.js SDK always injects the release value
   * itself, because the bundler plugin's own release injection breaks the `app` directory.
   *
   * More info: https://docs.sentry.io/product/releases/
   */
  release?: Omit<NonNullable<BuildTimeOptionsBase['release']>, 'inject'>;

  /**
   * Automatic instrumentation of server-side dependencies at build time.
   *
   * Set to `false` to turn it off.
   *
   * Turbopack support requires Next.js 16+; the webpack path works on earlier versions.
   *
   * @default true
   */
  buildTimeInstrumentation?: boolean;

  /**
   * A key that is used to identify the application in the Sentry bundler plugins.
   * This key is used by the `thirdPartyErrorFilterIntegration` to filter out errors
   * originating from third-party scripts.
   *
   * For webpack builds, this is forwarded to the `@sentry/bundler-plugins/webpack`.
   * For Turbopack builds, this injects module metadata via a custom loader.
   *
   * @see https://docs.sentry.io/platforms/javascript/configuration/filtering/#using-thirdpartyerrorfilterintegration
   */
  applicationKey?: string;

  /**
   * Metadata that should be associated with the built application.
   *
   * The metadata is serialized and can be looked up at runtime from within the SDK (for example in
   * `beforeSend`, event processors, or the transport), allowing for custom event filtering logic or
   * routing of events. Read it at runtime via `moduleMetadataIntegration`.
   *
   * Note: This currently only applies to webpack builds. On Turbopack builds it has no effect and
   * the SDK warns at build time. For `thirdPartyErrorFilterIntegration` support use
   * `applicationKey`, which works on both bundlers.
   */
  moduleMetadata?: ModuleMetadata | ModuleMetadataCallback;

  /**
   * Options related to react component name annotations.
   * Disabled by default, unless a value is set for this option.
   * When enabled, your app's DOM will automatically be annotated during build-time with their respective component names.
   * This will unlock the capability to search for Replays in Sentry by component name, as well as see component names in
   * breadcrumbs and performance monitoring.
   *
   * For webpack builds, this is forwarded to `@sentry/bundler-plugins/webpack`.
   * For Turbopack builds, this applies the annotations via a custom loader and requires Next.js 16+.
   */
  reactComponentAnnotation?: ReactComponentAnnotationOptions;

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
   * Suppress the warning about the `onRouterTransitionStart` hook.
   */
  suppressOnRouterTransitionStartWarning?: boolean;

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
   *
   * // Treat a custom param name as an optional i18n prefix
   * routeManifestInjection: {
   *   localeParamNames: ['lng']
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

        /**
         * Route param names that represent an i18n locale prefix, e.g. the `lng` in `app/[lng]/page.tsx`.
         *
         * Routes whose first param matches one of these names are also matched against paths that omit
         * the prefix, so that unprefixed default-locale URLs (e.g. next-intl's `localePrefix: 'as-needed'`)
         * are parameterized as the localized route instead of falling through to a catch-all.
         *
         * This replaces the built-in list rather than extending it. Pass an empty array to disable
         * optional prefix matching entirely.
         *
         * @default ['locale', 'lang', 'language', 'lng']
         */
        localeParamNames?: string[];
      };

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
    /**
     * Automatically instrument Vercel Cron Jobs in the App Router with Sentry Cron Monitors.
     * When enabled, the SDK will detect Vercel cron requests and create check-ins in Sentry.
     * Requires cron jobs to be configured in `vercel.json`.
     */
    vercelCronsMonitoring?: boolean;
    /**
     * Options for React component name annotation in Turbopack builds.
     * When enabled, JSX elements are annotated with `data-sentry-component`,
     * `data-sentry-element`, and `data-sentry-source-file` attributes.
     * Requires Next.js 16+.
     *
     * @deprecated Use the top-level `reactComponentAnnotation` option instead, which works for both webpack and Turbopack builds.
     */
    turbopackReactComponentAnnotation?: {
      /**
       * Whether the component name annotate plugin should be enabled or not.
       *
       * @deprecated Use the top-level `reactComponentAnnotation` option instead, which works for both webpack and Turbopack builds.
       */
      enabled?: boolean;

      /**
       * A list of strings representing the names of components to ignore. The plugin will not apply `data-sentry` annotations on the DOM element for these components.
       *
       * @deprecated Use the top-level `reactComponentAnnotation` option instead, which works for both webpack and Turbopack builds.
       */
      ignoredComponents?: string[];
    }; // TODO(v12): remove this option
  }>;

  /**
   * Options related to webpack builds, has no effect if you are using Turbopack.
   */
  webpack?: SentryBuildWebpackOptions;
};

type SentryBuildSourceMapsOptions = Omit<NonNullable<BuildTimeOptionsBase['sourcemaps']>, 'ignore'> & {
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
   * Toggle whether generated source maps within your Next.js build folder should be automatically deleted after being
   * uploaded to Sentry.
   *
   * Only applies to source maps the SDK generated itself. Setting `disable` to `true` or `"disable-upload"` leaves
   * source map generation entirely to your Next.js config, so nothing is auto-deleted either.
   *
   * Defaults to `true`.
   */
  deleteSourcemapsAfterUpload?: boolean;
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

// Condition used to filter when a loader rule applies.
// Supports built-in string conditions ('foreign', 'browser', 'development', 'production', 'node', 'edge-light')
// and boolean operators matching the Turbopack advanced condition syntax.
type TurbopackRuleConditionFilter =
  | string
  | { not: TurbopackRuleConditionFilter }
  | { all: TurbopackRuleConditionFilter[] }
  | { any: TurbopackRuleConditionFilter[] }
  | { path: string | RegExp }
  | { content: RegExp };

export type TurbopackRuleConfigItemOrShortcut = TurbopackLoaderItem[] | TurbopackRuleConfigItem;

export type TurbopackMatcherWithRule = {
  matcher: string;
  rule: TurbopackRuleConfigItemOrShortcut;
};

type TurbopackRuleConfigItemOptions = {
  loaders: TurbopackLoaderItem[];
  as?: string;
  condition?: TurbopackRuleConditionFilter;
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
