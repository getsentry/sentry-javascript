const path = require('path');
const { promises } = require('fs');

const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');

async function init(scenario) {
  if (!hasCurrentScenario(scenario)) {
    throw new Error(`Scenario "${scenario}" does not exist`);
  }

  console.log(`Bundling scenario: ${scenario}`);

  await runWebpack(scenario);
}

async function runWebpack(scenario) {
  const alias = await generateAlias();

  webpack(
    {
      mode: 'production',
      entry: path.resolve(__dirname, scenario),
      output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'dist', scenario),
      },
      plugins: [new BundleAnalyzerPlugin({ analyzerMode: 'static' }), new HtmlWebpackPlugin()],
      resolve: {
        alias,
      },
    },
    (err, stats) => {
      if (err || stats.hasErrors()) {
        console.log(err);
      }
      console.log('DONE', stats);
    },
  );
}

const PACKAGE_PATH = '../../packages';

/**
 * Generate webpack aliases based on packages in monorepo
 * Example of an alias: '@sentry/serverless': 'path/to/sentry-javascript/packages/serverless',
 */
async function generateAlias() {
  const dirents = await promises.readdir(PACKAGE_PATH);

  return Object.fromEntries(
    await Promise.all(
      dirents.map(async d => {
        const packageJSON = JSON.parse(await promises.readFile(path.resolve(PACKAGE_PATH, d, 'package.json')));
        return [packageJSON['name'], path.resolve(PACKAGE_PATH, d)];
      }),
    ),
  );
}

async function hasCurrentScenario(scenario) {
  const dirents = await promises.readdir(__dirname, { withFileTypes: true });
  return dirents.filter(dir => dir.isDirectory()).find(dir => dir.name === scenario);
}

const CURRENT_SCENARIO = 'basic';

init(CURRENT_SCENARIO);
