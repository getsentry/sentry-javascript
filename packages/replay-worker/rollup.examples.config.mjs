import { defineConfig } from 'rolldown';

const config = defineConfig([
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './examples/worker.js',
      format: 'esm',
    },
    treeshake: 'smallest',
  },
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './examples/worker.min.js',
      format: 'esm',
    },
    treeshake: 'smallest',
  },
]);

export default config;
