import type { Configuration } from 'webpack';

const config = function (userConfig: Record<string, unknown>): Configuration {
  return {
    ...userConfig,
    target: 'web',
    mode: 'none',
    resolve: {
      conditionNames: ['webpack', 'import', 'require', 'browser', 'default'],
    },
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
