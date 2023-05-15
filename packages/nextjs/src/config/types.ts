import type { GLOBAL_OBJ } from '@sentry/utils';
import type { SentryCliPluginOptions } from '@sentry/webpack-plugin';
import type { DefinePlugin, WebpackPluginInstance } from 'webpack';

export type SentryWebpackPluginOptions = SentryCliPluginOptions;
export type SentryWebpackPlugin = WebpackPluginInstance & { options: SentryWebpackPluginOptions };
// Export this from here because importing something from Webpack (the library) in `webpack.ts` confuses the heck out of
// madge, which we use for circular dependency checking. We've manually excluded this file from the check (which is
// safe, since it only includes types), so we can import it here without causing madge to fail. See
// https://github.com/pahen/madge/issues/306.
export type { WebpackPluginInstance };

/**
 * Overall Nextjs config
 */

// The first argument to `withSentryConfig` (which is the user's next config) may contain a `sentry` key, which we'll
// remove once we've captured it, in order to prevent nextjs from throwing warnings. Since it's only in there
// temporarily, we don't include it in the main `NextConfigObject` or `NextConfigFunction` types.
export type ExportedNextConfig = NextConfigObjectWithSentry | NextConfigFunctionWithSentry;

export type NextConfigObjectWithSentry = NextConfigObject & {
  sentry?: UserSentryOptions;
};

export type NextConfigFunctionWithSentry = (
  phase: string,
  defaults: { defaultConfig: NextConfigObject },
) => NextConfigObjectWithSentry;

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
  // Paths to reroute when requested
  rewrites?: () => Promise<
    | NextRewrite[]
    | {
        beforeFiles?: NextRewrite[];
        afterFiles?: NextRewrite[];
        fallback?: NextRewrite[];
      }
  >;
};

export type UserSentryOptions = {
  /**
   * Override the SDK's default decision about whether or not to enable to the Sentry webpack plugin for server files.
   * Note that `false` forces the plugin to be enabled, even in situations where it's not recommended.
   */
  disableServerWebpackPlugin?: boolean;

  /**
   * Override the SDK's default decision about whether or not to enable to the Sentry webpack plugin for client files.
   * Note that `false` forces the plugin to be enabled, even in situations where it's not recommended.
   */
  disableClientWebpackPlugin?: boolean;

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
   * Instructs the Sentry webpack plugin to upload source files from `<distDir>/static/chunks` rather than
   * `<distDir>/static/chunks/pages`. Usually files outside of `pages/` only contain third-party code, but in cases
   * where they contain user code, restricting the webpack plugin's upload breaks sourcemaps for those
   * user-code-containing files, because it keeps them from being uploaded. Defaults to `false`.
   */
  // We don't want to widen the scope if we don't have to, because we're guaranteed to end up uploading too many files,
  // which is why this defaults to`false`.
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
   * Defaults to `true`.
   */
  automaticVercelMonitors?: boolean;
};

export type NextConfigFunction = (phase: string, defaults: { defaultConfig: NextConfigObject }) => NextConfigObject;

/**
 * Webpack config
 */

// The two possible formats for providing custom webpack config in `next.config.js`
export type WebpackConfigFunction = (config: WebpackConfigObject, options: BuildContext) => WebpackConfigObject;
export type WebpackConfigObject = {
  devtool?: string;
  plugins?: Array<WebpackPluginInstance | SentryWebpackPlugin>;
  entry: WebpackEntryProperty;
  output: { filename: string; path: string };
  target: string;
  context: string;
  resolve?: {
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
  defaultLoaders: any;
  totalPages: number;
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
