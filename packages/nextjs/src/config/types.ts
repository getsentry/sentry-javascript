import type { GLOBAL_OBJ } from '@sentry/utils';
import type { SentryWebpackPluginOptions } from '@sentry/webpack-plugin';
import type { DefinePlugin, WebpackPluginInstance } from 'webpack';

// Export this from here because importing something from Webpack (the library) in `webpack.ts` confuses the heck out of
// madge, which we use for circular dependency checking. We've manually excluded this file from the check (which is
// safe, since it only includes types), so we can import it here without causing madge to fail. See
// https://github.com/pahen/madge/issues/306.
export type { WebpackPluginInstance };

// The first argument to `withSentryConfig` (which is the user's next config).
export type ExportedNextConfig = NextConfigObject | NextConfigFunction;

// Vendored from Next.js (this type is not complete - extend if necessary)
type NextRewrite = {
  source: string;
  destination: string;
};

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
     * Disable any functionality related to source maps upload.
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
     * Default: `[]`
     *
     * The globbing patterns follow the implementation of the `glob` package. (https://www.npmjs.com/package/glob)
     *
     * Use the `debug` option to print information about which files end up being uploaded.
     */
    ignore?: string | string[];

    /**
     * Toggle whether generated source maps within your Next.js build folder should be automatically deleted after being uploaded to Sentry.
     *
     * Defaults to `false`.
     */
    // TODO: Add this option
    // deleteSourcemapsAfterUpload?: boolean;
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
  };

  /**
   * Options to be passed directly to the Sentry Webpack Plugin (`@sentry/webpack-plugin`) that ships with the Sentry Next.js SDK.
   * You can use this option to override any options the SDK passes to the webpack plugin.
   *
   * Please note that this option is unstable and may change in a breaking way in any release.
   */
  unstable_sentryWebpackPluginOptions?: SentryWebpackPluginOptions;

  /**
   * Use `hidden-source-map` for webpack `devtool` option, which strips the `sourceMappingURL` from the bottom of built
   * JS files.
   */
  hideSourceMaps?: boolean;

  /**
   * Instructs webpack to apply the same transpilation rules to the SDK code as apply to user code. Helpful when
   * targeting older browsers which don't support ES6 (or ES6+ features like object spread).
   */
  transpileClientSDK?: boolean;

  /**
   * Include Next.js-internal code and code from dependencies when uploading source maps.
   *
   * Note: Enabling this option can lead to longer build times.
   * Disabling this option will leave you without readable stacktraces for dependencies and Next.js-internal code.
   *
   * Defaults to `false`.
   */
  // Enabling this option may upload a lot of source maps and since the sourcemap upload endpoint in Sentry is super
  // slow we don't enable it by default so that we don't opaquely increase build times for users.
  // TODO: Add an alias to this function called "uploadSourceMapsForDependencies"
  widenClientFileUpload?: boolean;

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
   * Exclude certain serverside API routes or pages from being instrumented with Sentry. This option takes an array of
   * strings or regular expressions. This options also affects pages in the `app` directory.
   *
   * NOTE: Pages should be specified as routes (`/animals` or `/api/animals/[animalType]/habitat`), not filepaths
   * (`pages/animals/index.js` or `.\src\pages\api\animals\[animalType]\habitat.tsx`), and strings must be be a full,
   * exact match.
   */
  excludeServerRoutes?: Array<RegExp | string>;

  /**
   * Tunnel Sentry requests through this route on the Next.js server, to circumvent ad-blockers blocking Sentry events
   * from being sent. This option should be a path (for example: '/error-monitoring').
   *
   * NOTE: This feature only works with Next.js 11+
   */
  tunnelRoute?: string;

  /**
   * Tree shakes Sentry SDK logger statements from the bundle.
   */
  disableLogger?: boolean;

  /**
   * Automatically create cron monitors in Sentry for your Vercel Cron Jobs if configured via `vercel.json`.
   *
   * Defaults to `false`.
   */
  automaticVercelMonitors?: boolean;
};

export type NextConfigFunction = (
  phase: string,
  defaults: { defaultConfig: NextConfigObject },
) => NextConfigObject | PromiseLike<NextConfigObject>;

/**
 * Webpack config
 */

// The two possible formats for providing custom webpack config in `next.config.js`
export type WebpackConfigFunction = (config: WebpackConfigObject, options: BuildContext) => WebpackConfigObject;
export type WebpackConfigObject = {
  devtool?: string;
  plugins?: Array<WebpackPluginInstance>;
  entry: WebpackEntryProperty;
  output: { filename: string; path: string };
  target: string;
  context: string;
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
    DefinePlugin: typeof DefinePlugin;
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
  __rewriteFramesDistDir__?: string;
  SENTRY_RELEASE?: { id: string };
  SENTRY_RELEASES?: { [key: string]: { id: string } };
};
