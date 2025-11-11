// inspired by https://justinribeiro.com/chronicle/2020/07/17/building-module-web-workers-for-cross-browser-compatibility-with-rollup/

import { defineConfig } from 'rolldown';

const config = defineConfig([
  {
    input: ['./src/index.ts'],
    treeshake: 'smallest',
    tsconfig: './tsconfig.build.json',
    output: {
      dir: './build/esm',
      format: 'esm',
      minify: true,
    },
    external: ['./worker'],
  },
  {
    input: ['./src/_worker.ts'],
    tsconfig: './tsconfig.build.json',
    output: {
      file: './build/esm/worker.ts',
      format: 'esm',
      minify: true,
    },
    treeshake: 'smallest',
    plugins: [
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
    tsconfig: './tsconfig.build.json',
    output: {
      file: './build/esm/worker-bundler.js',
      format: 'esm',
      minify: true,
    },
    treeshake: 'smallest',
  },
]);

export default config;
