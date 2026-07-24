function isCjs(): boolean {
  /*! rollup-include-cjs-only */
  return true;
  /*! rollup-include-cjs-only-end */

  /*! rollup-include-esm-only */
  return false;
  /*! rollup-include-esm-only-end */
}

/**
 * Check if the current Node.js version supports module.register
 */
export function supportsEsmLoaderHooks(): boolean {
  return !isCjs();
}
