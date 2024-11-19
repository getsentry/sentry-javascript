/**
 * CommonJS plugin docs: https://github.com/rollup/plugins/tree/master/packages/commonjs
 * License plugin docs: https://github.com/mjeanroy/rollup-plugin-license
 * Replace plugin docs: https://github.com/rollup/plugins/tree/master/packages/replace
 * Resolve plugin docs: https://github.com/rollup/plugins/tree/master/packages/node-resolve
 * Terser plugin docs: https://github.com/TrySound/rollup-plugin-terser#options
 * Terser docs: https://github.com/terser/terser#api-reference
 * Typescript plugin docs: https://github.com/rollup/plugins/tree/master/packages/typescript/#readme
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import deepMerge from 'deepmerge';
import license from 'rollup-plugin-license';
import { terser } from 'rollup-plugin-terser';

/**
 * Create a plugin to add an identification banner to the top of stand-alone bundles.
 *
 * @param title The title to use for the SDK, if not the package name
 * @returns An instance of the `rollup-plugin-license` plugin
 */
export function makeLicensePlugin(title) {
  const commitHash = childProcess.execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

  const plugin = license({
    banner: {
      content: `/*! <%= data.title %> <%= pkg.version %> (${commitHash}) | https://github.com/getsentry/sentry-javascript */`,
      data: { title },
    },
  });

  // give it a nicer name for later, when we'll need to sort the plugins
  plugin.name = 'license';

  return plugin;
}

export function getEs5Polyfills() {
  return fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../polyfills/es5.js'), 'utf-8');
}

/**
 * Create a plugin to set the value of the `__SENTRY_DEBUG__` magic string.
 *
 * @param includeDebugging Whether or not the resulting build should include log statements
 * @returns An instance of the `@rollup/plugin-replace` plugin to do the replacement of the magic string with `true` or
 * 'false`
 */
export function makeIsDebugBuildPlugin(includeDebugging) {
  return replace({
    // TODO `preventAssignment` will default to true in version 5.x of the replace plugin, at which point we can get rid
    // of this. (It actually makes no difference in this case whether it's true or false, since we never assign to
    // `__SENTRY_DEBUG__`, but if we don't give it a value, it will spam with warnings.)
    preventAssignment: true,
    values: {
      // Flags in current package
      __DEBUG_BUILD__: includeDebugging,
      // Flags in built monorepo dependencies, from which the bundle pulls
      __SENTRY_DEBUG__: includeDebugging,
    },
  });
}

export function makeSetSDKSourcePlugin(sdkSource) {
  return replace({
    preventAssignment: false,
    values: {
      __SENTRY_SDK_SOURCE__: JSON.stringify(sdkSource),
    },
  });
}

/**
 * Create a plugin to set the value of the `__SENTRY_BROWSER_BUNDLE__` magic string.
 *
 * @param isBrowserBuild Whether or not the resulting build will be run in the browser
 * @returns An instance of the `replace` plugin to do the replacement of the magic string with `true` or 'false`
 */
export function makeBrowserBuildPlugin(isBrowserBuild) {
  return replace({
    // TODO This will be the default in the next version of the `replace` plugin
    preventAssignment: true,
    values: {
      __SENTRY_BROWSER_BUNDLE__: isBrowserBuild,
    },
  });
}

// `terser` options reference: https://github.com/terser/terser#api-reference
// `rollup-plugin-terser` options reference: https://github.com/TrySound/rollup-plugin-terser#options

/**
 * Create a plugin to perform minification using `terser`.
 *
 * @returns An instance of the `terser` plugin
 */
export function makeTerserPlugin() {
  return terser({
    mangle: {
      // `captureException` and `captureMessage` are public API methods and they don't need to be listed here, as the
      // mangler won't touch user-facing things, but `sentryWrapped` is not user-facing, and would be mangled during
      // minification. (We need it in its original form to correctly detect our internal frames for stripping.) All three
      // are all listed here just for the clarity's sake, as they are all used in the frames manipulation process.
      reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
      properties: {
        // allow mangling of private field names...
        regex: /^_[^_]/,
        reserved: [
          // ...except for `_experiments`, which we want to remain usable from the outside
          '_experiments',
          // ...except for some localforage internals, which if we replaced them would break the localforage package
          // with the error "Error: Custom driver not compliant": https://github.com/getsentry/sentry-javascript/issues/5527.
          // Reference for which fields are affected: https://localforage.github.io/localForage/ (ctrl-f for "_")
          '_driver',
          '_initStorage',
          '_support',
          // We want to keep some replay fields unmangled to enable integration tests to access them
          '_replay',
          '_canvas',
          // We also can't mangle rrweb private fields when bundling rrweb in the replay CDN bundles
          '_cssText',
          // We want to keep the _integrations variable unmangled to send all installed integrations from replay
          '_integrations',
          // _meta is used to store metadata of replay network events
          '_meta',
          // Object we inject debug IDs into with bundler plugins
          '_sentryDebugIds',
          // These are used by instrument.ts in utils for identifying HTML elements & events
          '_sentryCaptured',
          '_sentryId',
          // For v7 backwards-compatibility we need to access txn._frozenDynamicSamplingContext
          // TODO (v8): Remove this reserved word
          '_frozenDynamicSamplingContext',
          // This is used in metadata integration
          '_sentryModuleMetadata',
        ],
      },
    },
    output: {
      comments: false,
    },
  });
}

/**
 * Create a TypeScript plugin, which will down-compile if necessary, based on the given JS version.
 *
 * @param jsVersion Either `es5` or `es6`
 * @returns An instance of the `typescript` plugin
 */
export function makeTSPlugin(jsVersion) {
  const baseTSPluginOptions = {
    tsconfig: 'tsconfig.json',
    compilerOptions: {
      declaration: false,
      declarationMap: false,
      paths: {
        '@sentry/browser': ['../browser/src'],
        '@sentry/core': ['../core/src'],
        '@sentry/hub': ['../hub/src'],
        '@sentry/types': ['../types/src'],
        '@sentry/utils': ['../utils/src'],
        '@sentry-internal/integration-shims': ['../integration-shims/src'],
        '@sentry-internal/tracing': ['../tracing-internal/src'],
      },
      baseUrl: '.',
    },
    include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
  };

  const plugin = typescript(
    deepMerge(baseTSPluginOptions, {
      compilerOptions: {
        target: jsVersion,
      },
    }),
  );

  // give it a nicer name for later, when we'll need to sort the plugins
  plugin.name = 'typescript';

  return plugin;
}

// We don't pass these plugins any options which need to be calculated or changed by us, so no need to wrap them in
// another factory function, as they are themselves already factory functions.

export function makeNodeResolvePlugin() {
  return nodeResolve();
}

export { commonjs as makeCommonJSPlugin };
