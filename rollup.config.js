/**
 * Shared config used by individual packages' Rollup configs
 */

import license from 'rollup-plugin-license';
import { terser } from 'rollup-plugin-terser';


/**
 * Create a plugin to add an identification banner to the top of stand-alone bundles.
 *
 * @param title The title to use for the SDK, if not the package name
 * @returns An instance of the `rollup-plugin-license` plugin
 */
export function makeLicensePlugin(title) {
  const commitHash = require('child_process').execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

  return license({
    banner: {
      content: `/*! <%= data.title || pkg.name %> <%= pkg.version %> (${commitHash}) | https://github.com/getsentry/sentry-javascript */`,
      data: { title },
    },
  });
}

export const terserPlugin = terser({
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapped is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity sake, as they are all used in the frames manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
    properties: {
      regex: /^_[^_]/,
    },
  },
  output: {
    comments: false,
  },
});
