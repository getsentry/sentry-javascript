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
