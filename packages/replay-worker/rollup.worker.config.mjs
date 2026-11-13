// inspired by https://justinribeiro.com/chronicle/2020/07/17/building-module-web-workers-for-cross-browser-compatibility-with-rollup/

import { treeShakePreset } from '@sentry-internal/rollup-utils';
import { parse } from 'acorn';
import { defineConfig } from 'rolldown';
import { minifySync } from 'rolldown/utils';

const config = defineConfig([
  {
    input: ['./src/index.ts'],
    treeshake: treeShakePreset('smallest'),
    tsconfig: './tsconfig.build.json',
    output: {
      dir: './build/esm',
      format: 'esm',
      minify: true,
    },
    transform: {
      target: 'es2020',
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
    treeshake: treeShakePreset('smallest'),
    transform: {
      target: 'es2020',
    },
    plugins: [
      {
        name: 'worker-to-string',
        // `output.minify` runs after `renderChunk`, so it only ever sees the wrapper below and
        // leaves the worker inside it untouched - that shipped ~10 kB of unminified fflate in every
        // Replay bundle. Minify here instead, before embedding.
        //
        // Embedded with `JSON.stringify` rather than a template literal because oxc's minifier
        // emits string literals as backticks, which would terminate the literal early and silently
        // produce an empty chunk.
        renderChunk(code) {
          // Unlike `output.minify`, `minifySync` doesn't pick up `transform.target` and defaults to esnext.
          const { code: minified } = minifySync('worker.js', code, { module: true, compress: { target: 'es2020' } });

          // `lint:es-compatibility` can't see into the string we embed below, so check the syntax here.
          parse(minified, { ecmaVersion: 2020, sourceType: 'module' });

          return `export default ${JSON.stringify(minified)};`;
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
    treeshake: treeShakePreset('smallest'),
    transform: {
      target: 'es2020',
    },
  },
]);

export default config;
