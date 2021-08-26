/** Simple queue with predefined size limit */
export class Queue<T> {
  private _store: Array<T> = [];
  public constructor(private readonly _limit: number) {}

  /** Add item to the queue if it has enough space */
  public enqueue(item: T): void {
    if (this._store.length >= this._limit) {
      throw new RangeError('Queue is full');
    }
    this._store.push(item);
  }

  /** Remove and return first item from the queue */
  public dequeue(): T | undefined {
    return this._store.shift();
  }
}
