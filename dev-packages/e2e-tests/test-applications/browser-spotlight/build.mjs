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
    resolve: {
      // Use 'development' condition to resolve to SDK builds that include Spotlight code
      // The @sentry packages use conditional exports with 'development' and 'production' conditions
      conditionNames: ['development', 'browser', 'module', 'import', 'require', 'default'],
    },
    optimization: {
      minimize: true,
      minimizer: [new TerserPlugin()],
    },
    plugins: [
      // Use DefinePlugin to properly set process and process.env values
      // We need both:
      // 1. 'process' defined so "typeof process !== 'undefined'" is true
      // 2. 'process.env' with the values so they can be read
      // DefinePlugin handles these correctly - more specific patterns take precedence
      new webpack.DefinePlugin({
        'process.env': JSON.stringify({
          E2E_TEST_DSN: process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567',
          SENTRY_SPOTLIGHT: 'http://localhost:3032/stream',
        }),
        // Define 'process' object so typeof check works - must come after process.env
        process: JSON.stringify({
          env: {
            E2E_TEST_DSN: process.env.E2E_TEST_DSN || 'https://public@dsn.ingest.sentry.io/1234567',
            SENTRY_SPOTLIGHT: 'http://localhost:3032/stream',
          },
        }),
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
