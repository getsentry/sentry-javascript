import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
  {
    input: ['src/index.ts'],
    output: {
      dir: 'build',
      sourcemap: true,
      preserveModules: false,
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
      commonjs(),
      replace({
        preventAssignment: true,
        values: {
          __DEBUG_BUILD__: true,
          __SENTRY_DEBUG__: true,
          __SENTRY_BROWSER_BUNDLE__: false,
        },
      }),
      typescript({ tsconfig: './tsconfig.build.json' }),
    ],
  },
  // The bundled types contain a declaration for the __DEBUG_BUILD__ global
  // This can result in errors about duplicate global declarations so we strip it out!
  {
    input: './build/index.d.ts',
    output: [{ file: 'build/index.d.ts', format: 'es' }],
    plugins: [
      dts({ respectExternal: true }),
      {
        name: 'strip-global',
        renderChunk(code) {
          return { code: code.replace(/declare global \{\s*const __DEBUG_BUILD__: boolean;\s*\}/g, '') };
        },
      },
    ],
  },
];
