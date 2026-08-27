// Bundles the entrypoint with webpack (the pinned version in package.json
// kept current, since webpack's `createRequire` following has changed across
// releases). Output goes to ./dist/app/ for assert.mjs to inspect.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';

const __dirname = dirname(fileURLToPath(import.meta.url));

function build(name) {
  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: join(__dirname, 'src', `${name}.mjs`),
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
        // graphql is the module the runtime hook has to instrument, so it has to stay out of the
        // bundle. Everything else, `@sentry/server-utils` included, is inlined: that is the setup
        // where downstream tree-shaking used to silently strip the code transformer
        // (https://github.com/getsentry/sentry-javascript/issues/23664).
        externals: { graphql: 'import graphql' },
        // Keep output readable; tree-shaking (module elimination via
        // `sideEffects: false`) happens regardless of minification, and
        // it's important to be able to debug when it messes up.
        optimization: { minimize: false },
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

await build('entry');
