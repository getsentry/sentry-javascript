import commonjs from 'rollup-plugin-commonjs';
import uglify from 'rollup-plugin-uglify';
import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import license from 'rollup-plugin-license';

const commitHash = require('child_process')
  .execSync('git rev-parse --short HEAD', { encoding: 'utf-8' })
  .trim();

const uglifyInstance = uglify({
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapepd is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity sake, as they are all used in the frames manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
  },
});

const bundleConfig = {
  input: 'src/index.ts',
  output: {
    format: 'iife',
    name: 'Sentry',
    sourcemap: true,
  },
  context: 'window',
  plugins: [
    typescript({
      tsconfig: 'tsconfig.build.json',
      tsconfigOverride: {
        compilerOptions: {
          declaration: false,
          paths: {
            '@sentry/utils/*': ['../utils/src/*'],
            '@sentry/core': ['../core/src'],
            '@sentry/hub': ['../hub/src'],
            '@sentry/types': ['../types/src'],
            '@sentry/minimal': ['../minimal/src'],
          },
        },
      },
      include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
    }),
    resolve({
      jsnext: true,
      main: true,
      browser: true,
    }),
    commonjs(),
    license({
      sourcemap: true,
      banner: `/*! @sentry/browser <%= pkg.version %> (${commitHash}) | https://github.com/getsentry/sentry-javascript */`,
    }),
  ],
};

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      interop: false,
      sourcemap: true,
    },
    external: ['@sentry/core', '@sentry/hub', '@sentry/minimal'],
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
        tsconfigOverride: {
          compilerOptions: {
            rootDir: 'src',
          },
        },
      }),
      resolve({
        jsnext: true,
        main: true,
        browser: true,
      }),
      commonjs(),
    ],
  },
  Object.assign({}, bundleConfig, {
    output: Object.assign({}, bundleConfig.output, {
      file: 'build/bundle.js',
    }),
  }),
  Object.assign({}, bundleConfig, {
    output: Object.assign({}, bundleConfig.output, {
      file: 'build/bundle.min.js',
    }),
    // Uglify has to be at the end of compilation, BUT before the license banner
    plugins: bundleConfig.plugins
      .slice(0, -1)
      .concat(uglifyInstance)
      .concat(bundleConfig.plugins.slice(-1)),
  }),
];
