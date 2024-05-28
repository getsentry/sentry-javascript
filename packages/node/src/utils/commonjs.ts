/** Detect CommonJS. */
export function isCjs(): boolean {
  return typeof require !== 'undefined';
}
