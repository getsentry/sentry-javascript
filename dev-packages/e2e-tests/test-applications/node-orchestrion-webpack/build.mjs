// Bundles both entrypoints with webpack (the pinned version in package.json
// kept current, since webpack's `createRequire` following has changed across
// releases). Outputs go to ./dist/<entry>/ for assert.mjs to inspect.
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

await Promise.all([build('no-orchestrion'), build('with-orchestrion')]);
