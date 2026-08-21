// Bundles the entrypoint with webpack twice:
//   - `plain`:  no Sentry plugin — the runtime diagnostics-channel injection is bundled (v11 default).
//   - `plugin`: with `sentryWebpackPlugin` (build-time instrumentation) — which defaults
//               `bundleSizeOptimizations.excludeChannelInjection` to `true`, tree-shaking the runtime
//               injection out of the bundle.
// assert.mjs inspects both outputs. Kept unminified so tree-shaking (module elimination via
// `sideEffects: false`) is easy to debug.
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
        // Minify so terser's dead-code elimination runs — the runtime injection is removed by the
        // `if (useChannelInjection)` branch going dead once `__SENTRY_CHANNEL_INJECTION__` is `false`,
        // which webpack only prunes via the minifier (not plain module tree-shaking).
        optimization: { minimize: true },
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
