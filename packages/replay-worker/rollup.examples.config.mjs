import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import { makeLicensePlugin } from '../../dev-packages/rollup-utils/plugins/index.mjs';

const licensePlugin = makeLicensePlugin('Sentry Replay Worker');

const esbuildPlugin = esbuild({ tsconfig: './tsconfig.json', target: 'es2020', sourceMap: false });

const config = defineConfig([
  {
    input: ['./src/_worker.ts'],
    output: {
      file: './examples/worker.js',
      format: 'esm',
    },
    treeshake: 'smallest',
    plugins: [commonjs(), esbuildPlugin, resolve(), licensePlugin],
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
      esbuildPlugin,
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
