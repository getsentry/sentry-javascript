import { plugins, treeShakePreset } from '@sentry-internal/rollup-utils';
import { defineConfig } from 'rolldown';

const banner = plugins.makeBannerOptions('Sentry Replay Worker', process.env.npm_package_version);

const config = defineConfig([
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './examples/worker.js',
      format: 'esm',
      banner,
    },
    transform: {
      target: 'es2020',
    },
    treeshake: treeShakePreset('smallest'),
  },
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './examples/worker.min.js',
      format: 'esm',
      banner,
      minify: true,
    },
    transform: {
      target: 'es2020',
    },
    treeshake: treeShakePreset('smallest'),
  },
]);

export default config;
