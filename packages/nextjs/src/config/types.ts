export { SentryCliPluginOptions as SentryWebpackPluginOptions } from '@sentry/webpack-plugin';

/**
 * Overall Nextjs config
 */

export type ExportedNextConfig = NextConfigObject | NextConfigFunction;

export type NextConfigObject = {
  // whether or not next should create source maps for browser code
  // see: https://nextjs.org/docs/advanced-features/source-maps
  productionBrowserSourceMaps?: boolean;
  // custom webpack options
  webpack?: WebpackConfigFunction;
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

// Each value in that object is either a string representing a single entry point, an array of such strings, or an
// object containing either of those, along with other configuration options. In that third case, the entry point(s) are
// listed under the key `import`.
export type EntryPropertyObject = {
  [key: string]:
    | string
    | Array<string>
    // only in webpack 5
    | EntryPointObject;
};

export type EntryPropertyFunction = () => Promise<EntryPropertyObject>;

// An object with options for a single entry point, potentially one of many in the webpack `entry` property
export type EntryPointObject = { import: string | Array<string> };
