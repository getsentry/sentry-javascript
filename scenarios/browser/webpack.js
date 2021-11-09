const path = require('path');
const { readdirSync } = require('fs')

const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');

const CURRENT_SCENARIO = 'basic';

const hasCurrentScenario = () =>
  readdirSync(__dirname, { withFileTypes: true })
    .filter(dir => dir.isDirectory())
    .find(dir => dir.name === CURRENT_SCENARIO)

if (!hasCurrentScenario()) {
  throw new Error(`Scenario "${CURRENT_SCENARIO}" does not exist`)
}

// eslint-disable-next-line no-console
console.log(`Bundling scenario: ${CURRENT_SCENARIO}`)

webpack(
  {
    mode: 'production',
    entry: path.resolve(__dirname, CURRENT_SCENARIO),
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist', CURRENT_SCENARIO),
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
