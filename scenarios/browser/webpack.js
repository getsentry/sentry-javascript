const path = require('path');

const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');

webpack(
  {
    mode: 'development',
    entry: path.resolve(__dirname, 'perf-auto'),
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist', 'perf-auto'),
    },
    plugins: [new BundleAnalyzerPlugin({ analyzerMode: 'static' }), new HtmlWebpackPlugin()],
  },
  (err, stats) => {
    if (err || stats.hasErrors()) {
      // eslint-disable-next-line no-console
      console.log(err);
    }
    // eslint-disable-next-line no-console
    console.log('DONE', stats);
  },
);
