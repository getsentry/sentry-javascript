/** Detect CommonJS. */
export function isCjs(): boolean {
  try {
    return typeof module !== 'undefined' && module && typeof module.exports !== 'undefined';
  } catch {
    return false;
  }
}
