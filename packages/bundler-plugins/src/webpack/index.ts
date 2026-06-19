import type { SentryWebpackPluginOptions } from './webpack4and5';
import { sentryWebpackPluginFactory } from './webpack4and5';
import { createRequire } from 'node:module';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PluginClass = new (options: any) => unknown;

type WebpackModule = {
  BannerPlugin?: PluginClass;
  DefinePlugin?: PluginClass;
  default?: WebpackModule;
};

// `webpack` is an optional peer dependency. We require it lazily so the plugin doesn't
// crash on load in bundlers that don't ship `webpack` (e.g. rspack) — those provide
// the plugin classes via `compiler.webpack` at runtime instead.
function loadWebpack(): WebpackModule {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Rollup transpiles import.meta for CJS
    return createRequire(import.meta.url)('webpack') as WebpackModule;
  } catch {
    return {};
  }
}

const webpack = loadWebpack();
const BannerPlugin = webpack.BannerPlugin ?? webpack.default?.BannerPlugin;
const DefinePlugin = webpack.DefinePlugin ?? webpack.default?.DefinePlugin;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sentryWebpackPlugin: (options?: SentryWebpackPluginOptions) => any = sentryWebpackPluginFactory({
  BannerPlugin,
  DefinePlugin,
});

export { sentryCliBinaryExists } from '../core';

export type { SentryWebpackPluginOptions };
