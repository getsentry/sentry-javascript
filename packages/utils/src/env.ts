/**
 * This module mostly exists for optimizations in the build process
 * through rollup and terser.  We define some global constants which
 * are normally undefined.  However terser overrides these with global
 * definitions which can be evaluated by the static analyzer when
 * creating a bundle.
 *
 * In turn the `isDebugBuild` and `isBrowserBundle` functions are pure
 * and can help us remove unused code from the bundles.
 */

declare const __SENTRY_BROWSER_BUNDLE__: boolean | undefined;
declare const __SENTRY_NO_DEBUG__: boolean | undefined;

/**
 * Figures out if we're building with debug functionality.
 *
 * @returns true if this is a debug build
 */
export function isDebugBuild(): boolean {
  return typeof __SENTRY_NO_DEBUG__ !== 'undefined' && !__SENTRY_BROWSER_BUNDLE__;
}

/**
 * Figures out if we're building a browser bundle.
 *
 * @returns true if this is a browser bundle build.
 */
export function isBrowserBundle(): boolean {
  return typeof __SENTRY_BROWSER_BUNDLE__ !== 'undefined' && !!__SENTRY_BROWSER_BUNDLE__;
}
