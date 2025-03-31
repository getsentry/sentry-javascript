/** Detect CommonJS. */
export function isCjs(): boolean {
  return typeof module !== 'undefined' && typeof module.exports !== 'undefined';
}
