import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { terser } from 'rollup-plugin-terser';

const config = defineConfig([
  {
    input: ['./src/_worker.ts'],
    output: {
      file: './examples/worker.js',
      format: 'esm',
    },
    treeshake: 'smallest',
    plugins: [
      commonjs(),
      typescript({ tsconfig: './tsconfig.json', inlineSourceMap: false, sourceMap: false, inlineSources: false }),
      resolve(),
    ],
  },
  {
    input: ['./src/_worker.ts'],
    output: {
      file: './examples/worker.min.js',
      format: 'esm',
    },
    treeshake: 'smallest',
    plugins: [
      commonjs(),
      typescript({ tsconfig: './tsconfig.json', inlineSourceMap: false, sourceMap: false, inlineSources: false }),
      resolve(),
      terser({
        mangle: {
          module: true,
        },
      }),
    ],
  },
]);

export default config;
