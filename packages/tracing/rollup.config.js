import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';

import { baseBundleConfig, makeLicensePlugin, markAsBrowserBuild, paths, terserPlugin } from '../../rollup.config';

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
  // replace `__SENTRY_BROWSER_BUNDLE__` with `true` to enable treeshaking of non-browser code
  markAsBrowserBuild,
  resolve({
    mainFields: ['module'],
  }),
];

const bundleConfig = {
  ...baseBundleConfig,
  input: 'src/index.ts',
  output: {
    ...baseBundleConfig.output,
    format: 'iife',
    name: 'Sentry',
  },
  context: 'window',
  plugins: [...plugins, licensePlugin],
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
