/**
 * NOTE: In order to avoid circular dependencies, if you add a function to this module and it needs to print something,
 * you must either a) use `console.log` rather than the `debug` singleton, or b) put your function elsewhere.
 */

import { isBrowserBundle } from './env';

/**
 * Checks whether we're in the Node.js or Browser environment
 *
 * @returns Answer to given question
 */
export function isNodeEnv(): boolean {
  // explicitly check for browser bundles as those can be optimized statically
  // by terser/rollup.
  return (
    !isBrowserBundle() &&
    Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]'
  );
}
