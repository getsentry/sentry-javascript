const path = require('path');
const { promises } = require('fs');

const webpack = require('webpack');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');

async function runWebpack(scenario, analyzerMode = 'json') {
  const alias = await generateAlias();

  return await new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'production',
        entry: path.resolve(__dirname, scenario),
        output: {
          filename: 'main.js',
          path: path.resolve(__dirname, 'dist', scenario),
        },
        plugins: [new BundleAnalyzerPlugin({ analyzerMode }), new HtmlWebpackPlugin()],
        resolve: {
          alias,
        },
      },
      (err, stats) => {
        if (err || stats.hasErrors()) {
          console.log(err);
          reject(err);
        }

        const usedModules = [];
        const modules = stats.compilation._modules;

        modules.forEach(async (value, key) => {
          usedModules.push(key);
        });

        return resolve(usedModules);
      },
    );
  });
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

module.exports = runWebpack;
