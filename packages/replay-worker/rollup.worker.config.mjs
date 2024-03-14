// inspired by https://justinribeiro.com/chronicle/2020/07/17/building-module-web-workers-for-cross-browser-compatibility-with-rollup/

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

const config = defineConfig([
  {
    input: ['./src/index.ts'],
    treeshake: 'smallest',
    output: {
      dir: './build/npm/esm',
      format: 'esm',
    },
    external: ['./worker'],
    plugins: [
      typescript({ tsconfig: './tsconfig.json', inlineSourceMap: false, sourceMap: false, inlineSources: false }),
      terser({
        mangle: {
          module: true,
        },
      }),
    ],
  },
  {
    input: ['./src/_worker.ts'],
    output: {
      file: './build/npm/esm/worker.ts',
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
      {
        name: 'worker-to-string',
        renderChunk(code) {
          return `export default \`${code}\`;`;
        },
      },
    ],
  },
]);

export default config;
