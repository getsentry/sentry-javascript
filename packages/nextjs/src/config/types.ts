import { SentryCliPluginOptions } from '@sentry/webpack-plugin';
import { WebpackPluginInstance } from 'webpack';

export type SentryWebpackPluginOptions = SentryCliPluginOptions;
export type SentryWebpackPlugin = WebpackPluginInstance & { options: SentryWebpackPluginOptions };

/**
 * Overall Nextjs config
 */

export type ExportedNextConfig = Partial<NextConfigObject> | NextConfigFunction;

export type NextConfigObject = {
  // custom webpack options
  webpack: WebpackConfigFunction;
  // whether to build serverless functions for all pages, not just API routes
  target: 'server' | 'experimental-serverless-trace';
  // the output directory for the built app (defaults to ".next")
  distDir: string;
  // the root at which the nextjs app will be served (defaults to "/")
  basePath: string;
  // config which will be available at runtime
  publicRuntimeConfig: { [key: string]: unknown };
  sentry?: UserSentryOptions;
} & {
  // other `next.config.js` options
  [key: string]: unknown;
};

export type UserSentryOptions = {
  disableServerWebpackPlugin?: boolean;
  disableClientWebpackPlugin?: boolean;
  hideSourceMaps?: boolean;

  // Force webpack to apply the same transpilation rules to the SDK code as apply to user code. Helpful when targeting
  // older browsers which don't support ES6 (or ES6+ features like object spread).
  transpileClientSDK?: boolean;

  // Upload files from `<distDir>/static/chunks` rather than `<distDir>/static/chunks/pages`. Usually files outside of
  // `pages/` only contain third-party code, but in cases where they contain user code, restricting the webpack
  // plugin's upload breaks sourcemaps for those user-code-containing files, because it keeps them from being
  // uploaded. At the same time, we don't want to widen the scope if we don't have to, because we're guaranteed to end
  // up uploading too many files, which is why this defaults to `false`.
  widenClientFileUpload?: boolean;
};

export type NextConfigFunction = (
  phase: string,
  defaults: { defaultConfig: NextConfigObject },
) => Partial<NextConfigObject>;

/**
 * Webpack config
 */

// the format for providing custom webpack config in your nextjs options
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
  // other webpack options
  [key: string]: unknown;
};

// Information about the current build environment
export type BuildContext = {
  dev: boolean;
  isServer: boolean;
  buildId: string;
  dir: string;
  config: NextConfigObject;
  webpack: { version: string };
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
  test?: string | RegExp;
  include?: Array<string | RegExp> | RegExp;
  exclude?: (filepath: string) => boolean;
  use?: ModuleRuleUseProperty | Array<ModuleRuleUseProperty>;
  oneOf?: Array<WebpackModuleRule>;
};

export type ModuleRuleUseProperty = {
  loader?: string;
  options?: Record<string, unknown>;
};
