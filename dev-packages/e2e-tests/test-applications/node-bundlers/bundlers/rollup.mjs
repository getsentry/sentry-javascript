import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import { nodeExternals } from './node-externals.mjs';

export async function bundle({ entry, outDir, external, plugins }) {
  const build = await rollup({
    input: entry,
    external: external ? [...nodeExternals, 'graphql'] : nodeExternals,
    plugins: [nodeResolve({ exportConditions: ['node', 'import', 'default'] }), commonjs(), ...plugins],
    onwarn: () => {},
  });
  await build.write({ dir: outDir, format: 'es', entryFileNames: 'main.mjs' });
  await build.close();
}
