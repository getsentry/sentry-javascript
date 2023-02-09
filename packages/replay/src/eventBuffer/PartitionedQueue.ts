/**
 * A queue with partitions for each checkout.
 */
export class PartitionedQueue<T> {
  private _items: T[];
  private _lastCheckoutPos?: number;

  public constructor() {
    this._items = [];
  }

  /** Add an item to the queue. */
  public add(record: T, isCheckout?: boolean): void {
    this._items.push(record);

    if (isCheckout) {
      this._lastCheckoutPos = this._items.length - 1;
    }
  }

  /**
   * Clear items from the queue.
   * If `keepLastCheckout` is given, all items after the last checkout will be kept.
   */
  public clear(keepLastCheckout?: boolean): void {
    if (!keepLastCheckout) {
      this._items = [];
      this._lastCheckoutPos = undefined;
      return;
    }

    if (this._lastCheckoutPos) {
      this._items = this._items.splice(this._lastCheckoutPos);
      this._lastCheckoutPos = undefined;
    }

    // Else, there is only a single checkout recorded yet, which we don't want to clear out
  }

  /** Get all items */
  public getItems(): T[] {
    return this._items;
  }

  /** Get the number of items that are queued. */
  public getLength(): number {
    return this._items.length;
  }
}
