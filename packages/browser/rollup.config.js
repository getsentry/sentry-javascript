import commonjs from 'rollup-plugin-commonjs';
import uglify from 'rollup-plugin-uglify';
import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
    },
    external: ['raven-js', '@sentry/core'],
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
      }),
      commonjs(),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'build/bundle.min.js',
      format: 'cjs',
      exports: 'named',
    },
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
        tsconfigOverride: { compilerOptions: { declaration: false } },
      }),
      resolve({
        jsnext: true,
        main: true,
        browser: true,
      }),
      commonjs({
        namedExports: {
          '../core/dist/index.js': ['FrontendBase', 'Sdk', 'SentryError'],
          '../utils/dist/index.js': ['forget'],
        },
      }),
      uglify(),
    ],
  },
];
