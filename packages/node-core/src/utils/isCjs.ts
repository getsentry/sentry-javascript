/** Detect CommonJS. */
export function isCjs(): boolean {
  /*! rollup-include-cjs-only */
  return true;
  /*! rollup-include-cjs-only-end */

  /*! rollup-include-esm-only */
  return false;
  /*! rollup-include-esm-only-end */
}
