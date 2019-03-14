// tslint:disable:no-unsafe-any
/**
 * Memo class used for decycle json objects. Uses WeakSet if available otherwise array.
 */
export class Memo {
  /** Determines if WeakSet is available */
  private readonly _hasWeakSet: boolean;
  /** Either WeakSet or Array */
  private readonly _inner: any;

  public constructor() {
    // tslint:disable-next-line
    this._hasWeakSet = typeof WeakSet === 'function';
    this._inner = this._hasWeakSet ? new WeakSet() : [];
  }

  /**
   * Sets obj to remember.
   * @param obj Object to remember
   */
  public memoize(obj: any): boolean {
    if (this._hasWeakSet) {
      if (this._inner.has(obj)) {
        return true;
      }
      this._inner.add(obj);
      return false;
    }
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < this._inner.length; i++) {
      const value = this._inner[i];
      if (value === obj) {
        return true;
      }
    }
    this._inner.push(obj);
    return false;
  }

  /**
   * Removes object from internal storage.
   * @param obj Object to forget
   */
  public unmemoize(obj: any): void {
    if (this._hasWeakSet) {
      this._inner.delete(obj);
    } else {
      for (let i = 0; i < this._inner.length; i++) {
        if (this._inner[i] === obj) {
          this._inner.splice(i, 1);
          break;
        }
      }
    }
  }
}
