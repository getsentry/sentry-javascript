// Bundles the entrypoint with webpack four ways, each a directly-runnable ESM bundle:
//   - `plain` / `plugin`:                   graphql inlined. Only `plugin` (with `sentryWebpackPlugin`)
//                                           build-time instruments it. Run without `--import`.
//   - `plain-external` / `plugin-external`: graphql kept external so the runtime `--import` hook can
//                                           intercept it at load time. Run with `--import`.
// `assert.mjs` runs all four and checks the graphql query works and that exactly one set of graphql
// spans is emitted in each instrumented scenario (build-time or runtime, never both/double).
// Kept unminified so the injected snippet keeps its identifiers.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import { sentryWebpackPlugin } from '@sentry/node/webpack';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

// No auth/release/telemetry — we only care about the build-time transforms and defines.
const makeSentryPlugin = () =>
  sentryWebpackPlugin({
    telemetry: false,
    sourcemaps: { disable: true },
    release: { create: false, finalize: false, inject: false },
  });

function build(name, { external, plugins }) {
  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: join(__dirname, 'src', 'entry.mjs'),
        mode: 'production',
        target: 'node',
        experiments: { topLevelAwait: true, outputModule: true },
        externalsType: 'module',
        // The `*-external` variants keep graphql out of the bundle, so it is resolved from
        // node_modules at runtime and the `--import` hook can transform it as it loads.
        externals: external ? { graphql: 'module graphql' } : {},
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

await build('plain', { external: false, plugins: [] });
await build('plugin', { external: false, plugins: [makeSentryPlugin()] });
await build('plain-external', { external: true, plugins: [] });
await build('plugin-external', { external: true, plugins: [makeSentryPlugin()] });
