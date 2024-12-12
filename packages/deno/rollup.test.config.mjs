import nodeResolve from '@rollup/plugin-node-resolve';
import sucrase from '@rollup/plugin-sucrase';
import { defineConfig } from 'rollup';
// @ts-check
import dts from 'rollup-plugin-dts';

export default [
  defineConfig({
    input: ['test/build.ts'],
    output: {
      file: 'build-test/index.js',
      sourcemap: true,
      preserveModules:
        process.env.SENTRY_BUILD_PRESERVE_MODULES === undefined
          ? false
          : Boolean(process.env.SENTRY_BUILD_PRESERVE_MODULES),
      strict: false,
      freeze: false,
      interop: 'auto',
      format: 'esm',
      banner: '/// <reference types="./index.d.ts" />',
    },
    plugins: [
      nodeResolve({
        extensions: ['.mjs', '.js', '.json', '.node', '.ts', '.tsx'],
      }),
      sucrase({ transforms: ['typescript'] }),
    ],
  }),
  defineConfig({
    input: './build-test/build.d.ts',
    output: [{ file: 'build-test/index.d.ts', format: 'es' }],
    plugins: [
      dts({ respectExternal: true }),
      // The bundled types contain a declaration for the __DEBUG_BUILD__ global
      // This can result in errors about duplicate global declarations so we strip it out!
      {
        name: 'strip-global',
        renderChunk(code) {
          return { code: code.replace(/declare global \{\s*const __DEBUG_BUILD__: boolean;\s*\}/g, '') };
        },
      },
    ],
  }),
];
