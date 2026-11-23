import webpack from 'webpack';

export function bundle({ entry, outDir, external, plugins }) {
  return new Promise((resolve, reject) => {
    webpack(
      {
        entry,
        mode: 'production',
        target: 'node',
        experiments: { topLevelAwait: true, outputModule: true },
        externalsType: 'module',
        externals: external ? { graphql: 'module graphql' } : {},
        output: {
          path: outDir,
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
          return reject(new Error(`webpack build of ${outDir} failed:\n${stats.toString({ errors: true })}`));
        }
        resolve();
      },
    );
  });
}
