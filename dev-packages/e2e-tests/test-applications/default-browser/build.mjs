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
    // The Lighthouse-CI baseline mode (SENTRY_LIGHTHOUSE_MODE=no-sentry) emits the
    // @sentry/browser chunk as a separately code-split asset (~265 KiB raw). Webpack's
    // default performance.hints='warning' fires AssetsOverSizeLimitWarning for that
    // chunk, and build.mjs's `if (stats.hasWarnings()) process.exit(1)` would then
    // abort the build. This is a test app, not a size-tracked production bundle, so
    // hints are disabled — size is tracked separately via .size-limit.js at the repo root.
    performance: { hints: false },
    plugins: [
      new webpack.EnvironmentPlugin({ E2E_TEST_DSN: '', SENTRY_LIGHTHOUSE_MODE: '' }),
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'public/index.html'),
      }),
    ],
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
