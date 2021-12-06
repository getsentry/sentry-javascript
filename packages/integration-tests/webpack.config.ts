import { Configuration } from 'webpack';

const config = function(userConfig: Record<string, unknown>): Configuration {
  return {
    ...userConfig,
    mode: 'none',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loader: 'babel-loader',
        },
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          loader: 'ts-loader',
          options: {
            // This has a big impact on test build speed.
            transpileOnly: true,
          },
        },
        {
          test: /\.hbs$/,
          exclude: /node_modules/,
          loader: 'handlebars-loader',
        },
      ],
    },
    stats: 'errors-only',
  };
};

export default config;
