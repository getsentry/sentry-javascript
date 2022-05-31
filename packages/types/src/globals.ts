/*
 * This file defines flags and constants that can be modified during compile time in order to facilitate tree shaking
 * for users.
 *
 * "Magic strings" like `__SENTRY_DEBUG__` must be replaced with actual values or safe statements during our build process.
 */

declare global {
  const __DEBUG_BUILD__: boolean;
}

// We need this empty export because of --isolatedModules
export {};
