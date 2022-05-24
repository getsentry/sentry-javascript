/*
 * This file defines flags and constants that can be modified during compile time in order to facilitate tree shaking
 * for users.
 *
 * Our code contains "magic strings" like `__DEBUG_BUILD__` that may get replaced with actual values during
 * our, or the user's build process. Take care when introducing new flags - they must not throw if they are not
 * replaced.
 */

declare const __DEBUG_BUILD__: boolean;
