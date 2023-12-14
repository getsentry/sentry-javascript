import type { Configuration } from 'webpack';

const config = (userConfig: Record<string, unknown>): Configuration => ({
  ...userConfig,
  mode: 'none',
  module: {
    rules: [
      {
        test: /\.(js|ts)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: { presets: [['@babel/preset-typescript', { allowNamespaces: true }]] },
      },
    ],
  },
  stats: 'errors-only',
});

export default config;
