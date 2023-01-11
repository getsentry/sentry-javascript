import type { RequireResult } from './types';

/**
 * Unwraps a module if it has been wrapped in an object under the key `default`.
 *
 * Adapted from Rollup (https://github.com/rollup/rollup)
 *
 * @param requireResult The result of calling `require` on a module
 * @returns The full module, unwrapped if necessary.
 */
export function _interopDefault(requireResult: RequireResult): RequireResult {
  return requireResult.__esModule ? (requireResult.default as RequireResult) : requireResult;
}

// Rollup version:
// function _interopDefault(e) {
//   return e && e.__esModule ? e['default'] : e;
// }
