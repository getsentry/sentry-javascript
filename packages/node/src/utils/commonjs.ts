/** Detect CommonJS. */
export function isCjs(): boolean {
  try {
    return typeof module !== 'undefined' && typeof module.exports !== 'undefined';
  } catch {
    return false;
  }
}
