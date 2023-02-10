// inspired by https://justinribeiro.com/chronicle/2020/07/17/building-module-web-workers-for-cross-browser-compatibility-with-rollup/

import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';

const config = defineConfig({
  input: ['./src/worker.ts'],
  output: {
    dir: './build/',
    format: 'esm',
  },
  plugins: [
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
    copy({
      targets: [{ src: 'vendor/*', dest: 'build' }],
    }),
  ],
});

export default config;
