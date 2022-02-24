import resolve from '@rollup/plugin-node-resolve';

import {
  baseBundleConfig,
  makeLicensePlugin,
  markAsBrowserBuild,
  terserPlugin,
  typescriptPluginES5,
} from '../../rollup.config';

const licensePlugin = makeLicensePlugin();

const plugins = [
  typescriptPluginES5,
  // replace `__SENTRY_BROWSER_BUNDLE__` with `true` to enable treeshaking of non-browser code
  markAsBrowserBuild,
  resolve({
    mainFields: ['module'],
  }),
  licensePlugin,
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
  plugins,
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
