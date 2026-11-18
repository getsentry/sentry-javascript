import { rolldown } from 'rolldown';
import { nodeExternals } from './node-externals.mjs';

// Rolldown is Rollup API-compatible, so it consumes the `@sentry/node/rollup` plugin. It resolves node
// modules and CommonJS natively, so it needs no resolve/commonjs plugins.
export async function bundle({ entry, outDir, external, plugins }) {
  const build = await rolldown({
    input: entry,
    external: external ? [...nodeExternals, 'graphql'] : nodeExternals,
    plugins,
    platform: 'node',
    onwarn: () => {},
  });
  await build.write({ dir: outDir, format: 'es', entryFileNames: 'main.mjs' });
  await build.close();
}
