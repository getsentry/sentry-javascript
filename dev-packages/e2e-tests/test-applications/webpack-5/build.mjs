import * as path from 'path';
import * as url from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

webpack(
  {
    entry: path.join(__dirname, 'entry.js'),
    output: {
      path: path.join(__dirname, 'build'),
      filename: 'app.js',
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin()],
    },
    plugins: [new HtmlWebpackPlugin(), new webpack.EnvironmentPlugin(['E2E_TEST_DSN'])],
    mode: 'production',
  },
  (err, stats) => {
    if (err) {
      console.error(err.stack || err);
      if (err.details) {
        console.error(err.details);
      }
      return;
    }

    const info = stats.toJson();

    if (stats.hasErrors()) {
      console.error(info.errors);
      process.exit(1);
    }

    if (stats.hasWarnings()) {
      console.warn(info.warnings);
      process.exit(1);
    }
  },
);
