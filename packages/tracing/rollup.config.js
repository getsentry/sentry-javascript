import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';

import { makeLicensePlugin, paths, terserPlugin } from '../../rollup.config';

const licensePlugin = makeLicensePlugin('@sentry/tracing & @sentry/browser');

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
      file: 'build/bundle.tracing.js',
    },
    plugins: bundleConfig.plugins,
  },
  {
    ...bundleConfig,
    input: 'src/index.bundle.ts',
    output: {
      ...bundleConfig.output,
      file: 'build/bundle.tracing.min.js',
    },
    // Uglify has to be at the end of compilation, BUT before the license banner
    plugins: bundleConfig.plugins.slice(0, -1).concat(terserPlugin).concat(bundleConfig.plugins.slice(-1)),
  },
];
