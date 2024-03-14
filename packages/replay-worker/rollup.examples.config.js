import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

import { makeLicensePlugin } from '../../rollup/plugins/index.js';

const licensePlugin = makeLicensePlugin('Sentry Replay Worker');

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
      licensePlugin,
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
      licensePlugin,
    ],
  },
]);

export default config;
