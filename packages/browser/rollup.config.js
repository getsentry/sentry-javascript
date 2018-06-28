import commonjs from 'rollup-plugin-commonjs';
import uglify from 'rollup-plugin-uglify';
import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import license from 'rollup-plugin-license';

const commitHash = require('child_process')
  .execSync('git rev-parse --short HEAD', { encoding: 'utf-8' })
  .trim();

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      interop: false,
    },
    external: ['@sentry/core', '@sentry/hub', '@sentry/minimal'],
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
      }),
      resolve({
        jsnext: true,
        main: true,
        browser: true,
      }),
      commonjs(),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'build/bundle.min.js',
      format: 'iife',
      name: 'Sentry',
      sourcemap: true,
    },
    context: 'window',
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
      commonjs(),
      uglify(),
      license({
        sourcemap: true,
        banner: `/*! @sentry/browser <%= pkg.version %> (${commitHash}) | https://github.com/getsentry/raven-js */`,
      }),
    ],
  },
];
