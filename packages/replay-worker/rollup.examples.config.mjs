import { treeShakePreset } from '@sentry-internal/rollup-utils';
import { defineConfig } from 'rolldown';

const config = defineConfig([
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './examples/worker.js',
      format: 'esm',
    },
    treeshake: treeShakePreset('smallest'),
  },
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './examples/worker.min.js',
      format: 'esm',
    },
    treeshake: treeShakePreset('smallest'),
  },
]);

export default config;
