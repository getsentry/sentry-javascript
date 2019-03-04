import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import license from 'rollup-plugin-license';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

const commitHash = require('child_process')
  .execSync('git rev-parse --short HEAD', { encoding: 'utf-8' })
  .trim();

const terserInstance = terser({
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapepd is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity sake, as they are all used in the frames manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
    properties: {
      regex: /^_/,
    },
  },
});

const plugins = [
  typescript({
    tsconfig: 'tsconfig.build.json',
    tsconfigOverride: {
      compilerOptions: {
        declaration: false,
        module: 'ES2015',
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
    browser: true,
    module: false,
    modulesOnly: true,
  }),
  commonjs(),
];

const bundleConfig = {
  input: 'src/index.ts',
  output: {
    format: 'iife',
    name: 'Sentry',
    sourcemap: true,
  },
  context: 'window',
  plugins: [
    ...plugins,
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
    external: ['tslib'],
    plugins,
  },
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.js',
    },
  },
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.min.js',
    },
    // Uglify has to be at the end of compilation, BUT before the license banner
    plugins: bundleConfig.plugins
      .slice(0, -1)
      .concat(terserInstance)
      .concat(bundleConfig.plugins.slice(-1)),
  },
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.es6.js',
    },
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            module: 'ES2015',
            paths: {
              '@sentry/utils/*': ['../utils/src/*'],
              '@sentry/core': ['../core/src'],
              '@sentry/hub': ['../hub/src'],
              '@sentry/types': ['../types/src'],
              '@sentry/minimal': ['../minimal/src'],
            },
            target: 'es6',
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      ...plugins.slice(1),
    ],
  },
  {
    ...bundleConfig,
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.es6.min.js',
    },
    plugins: [
      typescript({
        tsconfig: 'tsconfig.build.json',
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            module: 'ES2015',
            paths: {
              '@sentry/utils/*': ['../utils/src/*'],
              '@sentry/core': ['../core/src'],
              '@sentry/hub': ['../hub/src'],
              '@sentry/types': ['../types/src'],
              '@sentry/minimal': ['../minimal/src'],
            },
            target: 'es6',
          },
        },
        include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
      }),
      ...plugins
        .slice(1)
        .slice(0, -1)
        .concat(terserInstance)
        .concat(bundleConfig.plugins.slice(-1)),
    ],
  },
];
