declare const __DEBUG_BUILD__: boolean;

/**
 * ATTENTION: Never export across package boundaries — enables tree shaking in production bundles.
 */
export const DEBUG_BUILD = __DEBUG_BUILD__;
