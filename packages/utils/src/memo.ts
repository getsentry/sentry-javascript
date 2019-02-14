// tslint:disable:no-unsafe-any
/**
 * Memo class used for decycle json objects. Uses WeakSet if available otherwise array.
 */
export class Memo {
  /** Determines if WeakSet is available */
  private readonly hasWeakSet: boolean;
  /** Either WeakSet or Array */
  private readonly inner: any;

  public constructor() {
    // tslint:disable-next-line
    this.hasWeakSet = typeof WeakSet === 'function';
    this.inner = this.hasWeakSet ? new WeakSet() : [];
  }

  /**
   * Sets obj to remember.
   * @param obj Object to remember
   */
  public memoize(obj: any): boolean {
    if (this.hasWeakSet) {
      if (this.inner.has(obj)) {
        return true;
      }
      this.inner.add(obj);
      return false;
    } else {
      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < this.inner.length; i++) {
        const value = this.inner[i];
        if (value === obj) {
          return true;
        }
      }
      this.inner.push(obj);
      return false;
    }
  }

  /**
   * Removes object from internal storage.
   * @param obj Object to forget
   */
  public unmemoize(obj: any): void {
    if (this.hasWeakSet) {
      this.inner.delete(obj);
    } else {
      for (let i = 0; i < this.inner.length; i++) {
        if (this.inner[i] === obj) {
          this.inner.splice(i, 1);
          break;
        }
      }
    }
  }
}
