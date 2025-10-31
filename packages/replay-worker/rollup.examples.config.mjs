import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { makeLicensePlugin } from '../../dev-packages/rollup-utils/plugins/index.mjs';

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
      typescript({ tsconfig: './tsconfig.json', inlineSourceMap: false, sourceMap: false, inlineSources: false }),
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
      typescript({ tsconfig: './tsconfig.json', inlineSourceMap: false, sourceMap: false, inlineSources: false }),
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
