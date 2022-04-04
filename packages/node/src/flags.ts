/*
 * This file defines flags and constants that can be modified during
 * compile time in order to facilitate tree shaking for users
 */

declare const __SENTRY_DEBUG__: boolean;

/** Flag that is true for debug builds, false otherwise. */
export const IS_DEBUG_BUILD = typeof __SENTRY_DEBUG__ === 'undefined' ? true : __SENTRY_DEBUG__;
