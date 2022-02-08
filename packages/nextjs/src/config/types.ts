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
  sentry?: {
    disableServerWebpackPlugin?: boolean;
    disableClientWebpackPlugin?: boolean;
    hideSourceMaps?: boolean;
  };
} & {
  // other `next.config.js` options
  [key: string]: unknown;
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
