// @ts-check
import nodeResolve from '@rollup/plugin-node-resolve';
import sucrase from '@rollup/plugin-sucrase';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: ['src/index.ts'],
  treeshake: 'smallest',
  output: {
    file: 'build/index.mjs',
    sourcemap: true,
    preserveModules: false,
    strict: false,
    freeze: false,
    interop: 'auto',
    format: 'esm',
    banner: '/// <reference types="./index.d.ts" />',
  },
  plugins: [
    nodeResolve({
      extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
    }),
    sucrase({ transforms: ['typescript'] }),
  ],
});
