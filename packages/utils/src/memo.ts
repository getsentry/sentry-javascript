/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type MemoFunc = [
  // memoize
  (obj: any) => boolean,
  // unmemoize
  (obj: any) => void,
];

/**
 * Helper to decycle json objects
 */
export function memoBuilder(): MemoFunc {
  const hasWeakSet = typeof WeakSet === 'function';
  const inner: any = hasWeakSet ? new WeakSet() : [];
  function memoize(obj: any): boolean {
    if (hasWeakSet) {
      if (inner.has(obj)) {
        return true;
      }
      inner.add(obj);
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < inner.length; i++) {
      const value = inner[i];
      if (value === obj) {
        return true;
      }
    }
    inner.push(obj);
    return false;
  }

  function unmemoize(obj: any): void {
    if (hasWeakSet) {
      inner.delete(obj);
    } else {
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === obj) {
          inner.splice(i, 1);
          break;
        }
      }
    }
  }
  return [memoize, unmemoize];
}
