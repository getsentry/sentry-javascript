import type { SentryWebpackPluginOptions } from './webpack4and5';
import { sentryWebpackPluginFactory } from './webpack4and5';
import { createRequire } from 'node:module';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PluginClass = new (options: any) => unknown;

type WebpackSource = {
  source: () => string | Uint8Array;
};

type WebpackModule = {
  DefinePlugin?: PluginClass;
  Compilation?: {
    PROCESS_ASSETS_STAGE_ADDITIONS: number;
  };
  sources?: {
    ReplaceSource: new (source: WebpackSource) => WebpackSource & {
      insert: (position: number, value: string) => void;
    };
  };
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
const DefinePlugin = webpack.DefinePlugin ?? webpack.default?.DefinePlugin;
const Compilation = webpack.Compilation ?? webpack.default?.Compilation;
const sources = webpack.sources ?? webpack.default?.sources;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sentryWebpackPlugin: (options?: SentryWebpackPluginOptions) => any = sentryWebpackPluginFactory({
  DefinePlugin,
  Compilation,
  sources,
});

export type { SentryWebpackPluginOptions };
