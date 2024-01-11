const path = require('path');

module.exports = {
  target: 'node',
  entry: path.resolve(__dirname, './index.js'),
  mode: 'production',
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        loader: 'file-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, './dist/webpack'),
  },
};
