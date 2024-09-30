/** Detect CommonJS. */
export function isCjs(): boolean {
  return typeof module === 'undefined';
}
