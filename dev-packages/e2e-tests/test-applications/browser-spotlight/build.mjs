import * as path from 'path';
import * as url from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

webpack(
  {
    entry: path.join(__dirname, 'src/index.js'),
    output: {
      path: path.join(__dirname, 'build'),
      filename: 'app.js',
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin()],
    },
    plugins: [
      // Use DefinePlugin to properly set process.env.* values
      // Must also define 'process' so the typeof check works in browser
      new webpack.DefinePlugin({
        'process.env.E2E_TEST_DSN': JSON.stringify(
          process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567',
        ),
        'process.env.SENTRY_SPOTLIGHT': JSON.stringify('http://localhost:3032/stream'),
        // Define process so "typeof process !== 'undefined'" is true in browser
        process: JSON.stringify({ env: {} }),
      }),
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'public/index.html'),
      }),
    ],
    // Use development mode so Spotlight integration code is included
    // (Spotlight is stripped from production builds by design)
    mode: 'development',
  },
  (err, stats) => {
    if (err) {
      console.error(err.stack || err);
      if (err.details) {
        console.error(err.details);
      }
      process.exit(1);
    }

    const info = stats.toJson();

    if (stats.hasErrors()) {
      console.error(info.errors);
      process.exit(1);
    }

    if (stats.hasWarnings()) {
      console.warn(info.warnings);
    }
  },
);
