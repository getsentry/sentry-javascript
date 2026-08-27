// Bundles the entrypoint with webpack twice, each a directly-runnable ESM bundle with `graphql`
// inlined (only node builtins stay external):
//   - `plain`:  no Sentry plugin -> graphql is not instrumented.
//   - `plugin`: with `sentryWebpackPlugin` -> the orchestrion transform instruments graphql at build
//     time.
// `assert.mjs` runs both bundles and checks the graphql query works and which auto-spans appear.
// Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { sentryWebpackPlugin } from '@sentry/node/webpack';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

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
