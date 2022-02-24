import * as fs from 'fs';

import { terser } from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

import { addOnBundleConfig, baseBundleConfig, markAsBrowserBuild, typescriptPluginES5 } from '../../rollup.config';

const terserInstance = terser({
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapped is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity sake, as they are all used in the frames manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
    properties: false,
  },
  output: {
    comments: false,
  },
});

const plugins = [
  typescriptPluginES5,
  // replace `__SENTRY_BROWSER_BUNDLE__` with `true` to enable treeshaking of non-browser code
  markAsBrowserBuild,
  resolve({
    mainFields: ['module'],
  }),
  commonjs(),
];

function allIntegrations() {
  return fs.readdirSync('./src').filter(file => file != 'index.ts');
}

function loadAllIntegrations() {
  const builds = [];
  [
    {
      extension: '.js',
      plugins,
    },
    {
      extension: '.min.js',
      plugins: [...plugins, terserInstance],
    },
  ].forEach(build => {
    builds.push(
      ...allIntegrations().map(file => ({
        ...baseBundleConfig,
        input: `src/${file}`,
        output: {
          ...baseBundleConfig.output,
          ...addOnBundleConfig.output,
          file: `build/${file.replace('.ts', build.extension)}`,
        },
        plugins: build.plugins,
      })),
    );
  });
  return builds;
}

export default loadAllIntegrations();
