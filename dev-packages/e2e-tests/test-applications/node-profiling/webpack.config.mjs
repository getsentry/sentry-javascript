import * as path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default {
  mode: 'production',
  entry: './index.js',
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'dist', 'webpack'),
    filename: 'index.js',
  },
  resolve: {
    extensions: [".js", ".node"],
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        loader: "node-loader",
      },
    ],
  },
};
