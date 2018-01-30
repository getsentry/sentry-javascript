const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const path = require('path');
const fs = require('fs');
const rootDir = process.cwd();

const entries = ['index', 'standalone'].reduce((acc, name) => {
  const basePath = `./src/${name}.ts`;
  const filePath = path.resolve(rootDir, basePath);
  if (fs.existsSync(filePath)) acc[name] = basePath;
  return acc;
}, {});

module.exports = {
  context: rootDir,
  entry: entries,
  output: {
    path: path.resolve(rootDir, 'dist'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin()],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        exclude: [/node_modules/],
      },
    ],
  },
  stats: 'errors-only',
};
