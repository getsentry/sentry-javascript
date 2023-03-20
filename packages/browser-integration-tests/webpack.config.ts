import type { Configuration } from 'webpack';

const config = function (userConfig: Record<string, unknown>): Configuration {
  return {
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
  };
};

export default config;
