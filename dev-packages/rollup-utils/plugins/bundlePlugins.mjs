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

import { replacePlugin } from 'rolldown/plugins';
import terser from '@rollup/plugin-terser';

/**
 * Create a plugin to add an identification banner to the top of stand-alone bundles.
 *
 * @param title The title to use for the SDK, if not the package name
 * @param version The version of the SDK
 */
export function makeBannerOptions(title, version) {
  const commitHash = childProcess.execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

  return `/*! ${title} ${version} (${commitHash}) | https://github.com/getsentry/sentry-javascript */`;
}

/**
 * Create a plugin to set the value of the `__SENTRY_DEBUG__` magic string.
 *
 * @param includeDebugging Whether or not the resulting build should include log statements
 * @returns An instance of the `rolldown.replacePlugin` plugin to do the replacement of the magic string with `true` or
 * 'false`
 */
export function makeIsDebugBuildPlugin(includeDebugging) {
  return replacePlugin(
    {
      // Flags in current package
      __DEBUG_BUILD__: JSON.stringify(includeDebugging),
      // Flags in built monorepo dependencies, from which the bundle pulls
      __SENTRY_DEBUG__: JSON.stringify(includeDebugging),
    },
    {
      // TODO `preventAssignment` will default to true in version 5.x of the replace plugin, at which point we can get rid
      // of this. (It actually makes no difference in this case whether it's true or false, since we never assign to
      // `__SENTRY_DEBUG__`, but if we don't give it a value, it will spam with warnings.)
      preventAssignment: true,
    },
  );
}

export function makeSetSDKSourcePlugin(sdkSource) {
  return replacePlugin(
    {
      '/*! __SENTRY_SDK_SOURCE__ */': `return ${JSON.stringify(sdkSource)};`,
    },
    {
      preventAssignment: false,
      delimiters: ['', ''],
    },
  );
}

/**
 * Create a plugin to set the value of the `__SENTRY_BROWSER_BUNDLE__` magic string.
 *
 * @param isBrowserBuild Whether or not the resulting build will be run in the browser
 * @returns An instance of the `replace` plugin to do the replacement of the magic string with `true` or 'false`
 */
export function makeBrowserBuildPlugin(isBrowserBuild) {
  return replacePlugin(
    {
      __SENTRY_BROWSER_BUNDLE__: JSON.stringify(!!isBrowserBuild),
    },
    {
      // TODO This will be the default in the next version of the `replace` plugin
      preventAssignment: true,
    },
  );
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
          // We want to keep some replay fields unmangled to enable integration tests to access them
          '_replay',
          '_canvas',
          // We also can't mangle rrweb private fields when bundling rrweb in the replay CDN bundles
          '_cssText',
          // We want to keep the _integrations variable unmangled to send all installed integrations from replay
          '_integrations',
          // _meta is used to store metadata of replay network events
          '_meta',
          // We store SDK metadata in the options
          '_metadata',
          // Object we inject debug IDs into with bundler plugins
          '_sentryDebugIds',
          // These are used by instrument.ts in utils for identifying HTML elements & events
          '_sentryCaptured',
          '_sentryId',
          // Keeps the frozen DSC on a Sentry Span
          '_frozenDsc',
          // These are used to keep span & scope relationships
          '_sentryRootSpan',
          '_sentryChildSpans',
          '_sentrySpan',
          '_sentryScope',
          '_sentryIsolationScope',
          // require-in-the-middle calls `Module._resolveFilename`. We cannot mangle this (AWS lambda layer bundle).
          '_resolveFilename',
          // Set on e.g. the shim feedbackIntegration to be able to detect it
          '_isShim',
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
