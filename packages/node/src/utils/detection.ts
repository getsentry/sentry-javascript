function isCjs(): boolean {
  /*! rollup-include-cjs-only */
  return true;
  /*! rollup-include-cjs-only-end */

  /*! rollup-include-esm-only */
  // oxlint-disable-next-line no-unreachable -- reachable only in the ESM build; rollup strips the CJS return above
  return false;
  /*! rollup-include-esm-only-end */
}

/**
 * Check if the current Node.js version supports module.register
 */
export function supportsEsmLoaderHooks(): boolean {
  return !isCjs();
}
