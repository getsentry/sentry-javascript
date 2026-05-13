// inspired by https://justinribeiro.com/chronicle/2020/07/17/building-module-web-workers-for-cross-browser-compatibility-with-rollup/

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

const esbuildPlugin = esbuild({ tsconfig: './tsconfig.json', target: 'es2020', sourceMap: false });

const config = defineConfig([
  {
    input: ['./src/index.ts'],
    treeshake: 'smallest',
    output: {
      dir: './build/esm',
      format: 'esm',
    },
    external: ['./worker'],
    plugins: [
      esbuildPlugin,
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
      file: './build/esm/worker.ts',
      format: 'esm',
    },
    treeshake: 'smallest',
    plugins: [
      commonjs(),
      esbuildPlugin,
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
  {
    input: ['./src/_worker.ts'],
    output: {
      file: './build/esm/worker-bundler.js',
      format: 'esm',
    },
    treeshake: 'smallest',
    plugins: [
      commonjs(),
      esbuildPlugin,
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
