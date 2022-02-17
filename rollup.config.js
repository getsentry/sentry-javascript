/**
 * Shared config used by individual packages' Rollup configs
 */

import license from 'rollup-plugin-license';
import replace from '@rollup/plugin-replace';
import { terser } from 'rollup-plugin-terser';

export const paths = {
  '@sentry/browser': ['../browser/src'],
  '@sentry/core': ['../core/src'],
  '@sentry/hub': ['../hub/src'],
  '@sentry/minimal': ['../minimal/src'],
  '@sentry/types': ['../types/src'],
  '@sentry/utils': ['../utils/src'],
};

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

export const markAsBrowserBuild = replace({
  // don't replace `__placeholder__` where it's followed immediately by a single `=` (to prevent ending up
  // with something of the form `let "replacementValue" = "some assigned value"`, which would cause a
  // syntax error)
  preventAssignment: true,
  // the replacement to make
  values: {
    __SENTRY_BROWSER_BUNDLE__: true,
  },
});

export const baseBundleConfig = {
  output: {
    sourcemap: true,
    strict: false,
    esModule: false,
  },
};
