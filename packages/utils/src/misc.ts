/**
 * Safely get global scope object
 *
 * @returns Global scope object
 */
// tslint:disable:strict-type-predicates
export function getGlobalObject(): Window | NodeJS.Global | {} {
  return typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : typeof self !== 'undefined' ? self : {};
}
// tslint:enable:strict-type-predicates
