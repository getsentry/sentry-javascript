const path = require('node:path');
const { promises } = require('node:fs');
const { parseArgs } = require('node:util');

const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');

async function init() {
  const scenarios = await getScenariosFromDirectories();

  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { scenario: { type: 'string', short: 's' }, list: { type: 'boolean', short: 'l' } },
  });

  if (values.list) {
    console.log('Available scenarios:', scenarios);
    process.exit(0);
  }

  if (!scenarios.some(scenario => scenario === values.scenario)) {
    console.error('Invalid scenario:', values.scenario);
    console.error('Available scenarios:', scenarios);
    process.exit(1);
  }

  console.log(`Bundling scenario: ${values.scenario}`);

  await runWebpack(values.scenario);
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

      // console.log('DONE', stats);
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

/**
 * Generates an array of available scenarios
 */
async function getScenariosFromDirectories() {
  const exclude = ['node_modules', 'dist', '~', 'package.json', 'yarn.lock', 'README.md', '.DS_Store', 'webpack.cjs'];

  const dirents = await promises.readdir(path.join(__dirname), { withFileTypes: true });
  return dirents.map(dirent => dirent.name).filter(mape => !exclude.includes(mape));
}

init();
