export type RingBufferOnDrop<T> = (item: T) => unknown;

export type RingBufferOptions<T> = {
  capacity: number;
  onDrop?: RingBufferOnDrop<T>;
};

/**
 * A simple pointer-based ring buffer implementation
 */
export class RingBuffer<T> {
  #read: number;
  #write: number;
  #size: number;
  #capacity: number;
  #data: (T | undefined)[];
  #onDrop?: RingBufferOnDrop<T>;

  public constructor(options: RingBufferOptions<T>) {
    const { capacity, onDrop } = options;
    this.#read = 0;
    this.#write = 0;
    this.#size = 0;
    this.#capacity = capacity;
    this.#data = new Array(capacity);
    this.#onDrop = onDrop;
  }

  /** how many items does the buffer hold? */
  public get capacity(): number {
    return this.#capacity;
  }

  /**
   * is the buffer empty?
   */
  public get empty(): boolean {
    return this.#size === 0;
  }

  /**
   * is the buffer full?
   */
  public get full(): boolean {
    return this.#size === this.#capacity;
  }

  /**
   * The number of items in the buffer.
   */
  public get size(): number {
    return this.#size;
  }

  /**
   * Add an item at the write position
   *
   * May trigger the `onDrop` callback if one was provided,
   */
  public push(item: T): number {
    const dropped = this.full ? this.shift() : undefined;
    this.#data[this.#write] = item;
    this.#write = this.#advance(this.#write);
    if (dropped !== undefined) this.#onDrop?.(dropped);
    return ++this.#size;
  }

  /**
   * look at what the shift() will return, without changing anything
   */
  public peek(): T | undefined {
    if (this.empty) return undefined;
    return this.#data[this.#read];
  }

  /**
   * Consume the item at the read position
   */
  public shift(): T | undefined {
    if (this.empty) return undefined;
    const item = this.#data[this.#read];
    this.#data[this.#read] = undefined;
    this.#read = this.#advance(this.#read);
    this.#size--;
    return item;
  }

  /**
   * Consume the most *recently* added item, ie, from the write
   * position, to support the `drop_newest` overflow policy
   * in the `TelemetryBuffer`.
   */
  public pop(): T | undefined {
    if (this.empty) return undefined;
    this.#write = this.#write - 1;
    if (this.#write === -1) this.#write += this.#capacity;
    const item = this.#data[this.#write];
    this.#data[this.#write] = undefined;
    this.#size--;
    return item;
  }

  /**
   * Remove all items from the buffer
   */
  public clear(): void {
    if (this.empty) return;
    this.#data = new Array(this.#capacity);
    this.#size = 0;
    this.#write = this.#read;
  }

  /**
   * Iterating through the ring buffer yields all the items in order,
   * but without actually consuming them.
   */
  public *[Symbol.iterator](): Generator<T, void, unknown> {
    if (!this.empty) {
      let i = this.#read;
      do {
        const item = this.#data[i];
        if (item !== undefined) yield item;
        i = this.#advance(i);
      } while (i !== this.#write);
    }
  }

  #advance(n: number): number {
    return (n + 1) % this.#capacity;
  }
}
