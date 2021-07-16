export { SentryCliPluginOptions as SentryWebpackPluginOptions } from '@sentry/webpack-plugin';

/**
 * Overall Nextjs config
 */

export type ExportedNextConfig = NextConfigObject | NextConfigFunction;

export type NextConfigObject = {
  // custom webpack options
  webpack?: WebpackConfigFunction;
  sentry?: {
    disableServerWebpackPlugin?: boolean;
    disableClientWebpackPlugin?: boolean;
  };
} & {
  // other `next.config.js` options
  [key: string]: unknown;
};

export type NextConfigFunction = (
  phase: string,
  defaults: { defaultConfig: { [key: string]: unknown } },
) => NextConfigObject;

/**
 * Webpack config
 */

// the format for providing custom webpack config in your nextjs options
export type WebpackConfigFunction = (config: WebpackConfigObject, options: BuildContext) => WebpackConfigObject;

export type WebpackConfigObject = {
  devtool?: string;
  plugins?: Array<{ [key: string]: unknown }>;
  entry: WebpackEntryProperty;
  output: { filename: string; path: string };
  target: string;
  context: string;
} & {
  // other webpack options
  [key: string]: unknown;
};

// Information about the current build environment
export type BuildContext = { dev: boolean; isServer: boolean; buildId: string };

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
