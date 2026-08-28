// Bundles the entrypoint with webpack twice:
//   - `plain`:  no Sentry plugin.
//   - `plugin`: with `sentryWebpackPlugin` (build-time instrumentation).
// Only the `plugin` build runs the orchestrion code transform, which injects the "bundler ran" banner
// into the entry chunk. Kept unminified so the banner keeps its identifiers (a minifier would
// rename them); assert.mjs matches it whitespace-insensitively.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { sentryWebpackPlugin } from '@sentry/node/webpack';

const __dirname = dirname(fileURLToPath(import.meta.url));

function build(name, plugins) {
  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: join(__dirname, 'src', 'entry.mjs'),
        mode: 'production',
        target: 'node',
        experiments: { topLevelAwait: true, outputModule: true },
        output: {
          path: join(__dirname, 'dist', name),
          filename: 'main.mjs',
          module: true,
          library: { type: 'module' },
          chunkFormat: 'module',
        },
        optimization: { minimize: false },
        plugins,
      },
      (err, stats) => {
        if (err) return reject(err);
        if (stats.hasErrors()) {
          return reject(new Error(`webpack build of ${name} failed:\n${stats.toString({ errors: true })}`));
        }
        // eslint-disable-next-line no-console
        console.log(`built ${name} (webpack ${webpack.version})`);
        resolve();
      },
    );
  });
}

await build('plain', []);
await build(
  'plugin',
  // No auth/release/telemetry — we only care about the build-time transforms and defines.
  [
    sentryWebpackPlugin({
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false, finalize: false, inject: false },
    }),
  ],
);
