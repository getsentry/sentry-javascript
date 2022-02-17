import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';

import { makeLicensePlugin, terserPlugin } from '../../rollup.config';

const licensePlugin = makeLicensePlugin();

const paths = {
  '@sentry/utils': ['../utils/src'],
  '@sentry/core': ['../core/src'],
  '@sentry/hub': ['../hub/src'],
  '@sentry/types': ['../types/src'],
  '@sentry/minimal': ['../minimal/src'],
  '@sentry/browser': ['../browser/src'],
};

const plugins = [
  typescript({
    tsconfig: 'tsconfig.esm.json',
    tsconfigOverride: {
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        paths,
        baseUrl: '.',
      },
    },
    include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
  }),
  replace({
    // don't replace `__placeholder__` where it's followed immediately by a single `=` (to prevent ending up
    // with something of the form `let "replacementValue" = "some assigned value"`, which would cause a
    // syntax error)
    preventAssignment: true,
    // the replacements to make
    values: {
      __SENTRY_BROWSER_BUNDLE__: true,
    },
  }),
  resolve({
    mainFields: ['module'],
  }),
];

const bundleConfig = {
  input: 'src/index.ts',
  output: {
    format: 'iife',
    name: 'Sentry',
    sourcemap: true,
    strict: false,
    esModule: false,
  },
  context: 'window',
  plugins: [...plugins, licensePlugin],
  treeshake: 'smallest',
};

export default [
  // ES5 Browser Tracing Bundle
  {
    ...bundleConfig,
    input: 'src/index.bundle.ts',
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.vue.js',
    },
    plugins: bundleConfig.plugins,
  },
  {
    ...bundleConfig,
    input: 'src/index.bundle.ts',
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.vue.min.js',
    },
    // Uglify has to be at the end of compilation, BUT before the license banner
    plugins: bundleConfig.plugins.slice(0, -1).concat(terserPlugin).concat(bundleConfig.plugins.slice(-1)),
  },
];
