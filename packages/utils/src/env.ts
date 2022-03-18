/**
 * This module exists for optimizations in the build process through rollup and terser.  We define some global
 * constants, which can be overridden during build. By guarding certain pieces of code with functions that return these
 * constants, we can control whether or not they appear in the final bundle. (Any code guarded by a false condition will
 * never run, and will hence be dropped during treeshaking.) The two primary uses for this are stripping out calls to
 * `logger` and preventing node-related code from appearing in browser bundles.
 */

declare const __SENTRY_BROWSER_BUNDLE__: boolean | undefined;

const __SENTRY_DEBUG__ = true;

/**
 * Figures out if we're building with debug functionality.
 *
 * @returns true if this is a debug build
 */
export function isDebugBuild(): boolean {
  return __SENTRY_DEBUG__;
}

/**
 * Figures out if we're building a browser bundle.
 *
 * @returns true if this is a browser bundle build.
 */
export function isBrowserBundle(): boolean {
  return typeof __SENTRY_BROWSER_BUNDLE__ !== 'undefined' && !!__SENTRY_BROWSER_BUNDLE__;
}
