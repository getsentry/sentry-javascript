import { Span } from '../types-hoist/span';
import { RingBuffer } from '../utils/ring-buffer';

/* v8 ignore start */
const perf =
  typeof performance === 'object' && !!performance && typeof performance.now === 'function' ? performance : Date;
/* v8 ignore stop */

export type TelemetryBufferOverflowPolicy = 'drop_oldest' | 'drop_newest';

export type TelemetryBufferOnDropCallback<T> = (
  item: T,
  reason: `buffer_full_${TelemetryBufferOverflowPolicy}`,
) => unknown;

/** Shared options for the TelemetryBuffer and TelemetryBucketBuffer classes */
export type TelemetryBufferOptions<T> = {
  /** maximum number of objects to store */
  capacity: number;
  /**
   * What to do when the buffer is full.
   *
   * - `'drop_oldest'`: Evicts the oldest item when the buffer is full,
   *   making room for new data. This is the normal SDK behavior.
   * - `'drop_newest'`: Rejects incoming items when full, preserving what's
   *   already queued.
   *
   * @default 'drop_oldest'
   */
  overflowPolicy?: TelemetryBufferOverflowPolicy;

  /**
   * Number of items to emit in a batch when ready
   */
  batchSize: number;

  /**
   * Time in ms to wait before sending a partial batch, even if not yet full.
   * Note that this will generally correspond to the age of the oldest item
   * in a partial batch, or the time since the last flush when a batch is
   * created.
   */
  timeout: number;

  /**
   * Callback fired when an item is dropped from the buffer due to overflow
   */
  onDrop?: TelemetryBufferOnDropCallback<T>;
};

const REJECT_WRITE = Symbol('rejectWrite');
const DROP_OLD = Symbol('dropOld');
const ADD_ITEM = Symbol('addItem');
const GET_BATCH = Symbol('getBatch');

/**
 * Base class for the TelemetryBuffer types for single items and
 * trace ID buckets.
 *
 * First type is what the consumer sees, second is the internal type,
 * which is either the same, or a list of items in a single bucket.
 */
export abstract class TelemetryBufferBase<T, I extends T | T[]> {
  #store: RingBuffer<I>;
  #onDrop?: TelemetryBufferOnDropCallback<I>;
  #overflowPolicy: TelemetryBufferOverflowPolicy;
  #timeout: number;
  #batchSize: number;
  #lastFlushTime: number;
  #timer?: ReturnType<typeof setTimeout>;
  #resolvePoll?: (items: T[]) => void;
  #polling?: Promise<T[]> | undefined;

  public constructor(options: TelemetryBufferOptions<I>) {
    const { capacity, onDrop, batchSize, timeout, overflowPolicy = 'drop_oldest' } = options;
    this.#store = new RingBuffer<I>({
      capacity,
      onDrop: (item: I) => this[DROP_OLD](item, onDrop),
    });
    this.#overflowPolicy = overflowPolicy;
    this.#timeout = timeout;
    if (batchSize > capacity) {
      throw Object.assign(new TypeError('batchSize must be < capacity'), {
        cause: { capacity, batchSize },
      });
    }
    if (batchSize <= 0 || capacity <= 0) {
      throw Object.assign(new TypeError('batchSize and capacity must be > 0'), {
        cause: { capacity, batchSize },
      });
    }
    if (timeout < 0) {
      throw Object.assign(new TypeError('timeout must be >= 0'), {
        cause: { timeout },
      });
    }
    this.#batchSize = batchSize;
    this.#lastFlushTime = perf.now();
    this.#onDrop = onDrop;
  }

  /** is the buffer full? */
  public get full(): boolean {
    return this.#store.full;
  }

  /** is the buffer empty? */
  public get empty(): boolean {
    return this.#store.empty;
  }

  /** how many items in the buffer */
  public get size(): number {
    return this.#store.size;
  }

  /** is there data ready to be sent? */
  public get ready(): boolean {
    return this.size > 0 && (this.size >= this.#batchSize || this.#lastFlushTime + this.#timeout <= perf.now());
  }

  /**
   * Add an item to the buffer. This may trigger a pending poll action, if it
   * causes the size to reach the batchSize, or the flush timeout is expired.
   */
  public offer(item: T): void {
    // if this is the FIRST item in the buffer, its age is effectively zero
    // waiting on an empty buffer doesn't trigger timeout expiration.
    if (this.size === 0) {
      this.#lastFlushTime = perf.now();
      this.#resetTimeout(this.#timeout);
    }

    // if we drop newest, then reject the overflow write
    // otherwise, just let the ring buffer handle it normally.
    if (this.full && this.#overflowPolicy === 'drop_newest') {
      if (this.#onDrop) this[REJECT_WRITE](item, this.#onDrop);
      return;
    }

    this[ADD_ITEM](item, this.#store);

    // if we're waiting for something, this might be enough.
    if (this.#resolvePoll) this.pollIfReady();

    // only relevant for Bucket buffer. otherwise the RingBuffer
    // implementation handles this. If the put caused the RingBuffer
    // to drop a bucket, then it means that ALL buckets were exactly one
    // item, and we will have updated this.#size in the onDrop method.
    if (this.size > this.#store.capacity) {
      const dropped = this.#store.shift();
      if (dropped) this[DROP_OLD](dropped, this.#onDrop);
    }
  }

  /**
   * Synchronously return either the currently ready batch, or
   * undefined if no batch is ready.
   *
   * Resolves pending `poll()` promises if items are available.
   */
  public pollIfReady(): T[] | undefined {
    if (!this.ready) {
      if (!this.size) {
        this.#lastFlushTime = perf.now();
      }
      return undefined;
    }
    const batch = this[GET_BATCH](this.#batchSize, this.#store);
    this.#lastFlushTime = perf.now();
    this.#resolve(batch);
    return batch;
  }

  /**
   * Asynchronously return up to batchSize items when ready.
   *
   * This will eventually return a single batch of items, up to `batchSize`,
   * or however many are available when the flush timeout expires.
   */
  public poll(): Promise<T[]> {
    // if we're already polling, just hook onto the same promise
    //
    // NB: this is NOT an async function on purpose. We do not want to
    // take the hit of double-wrapping the Promise object.
    return (this.#polling ??= new Promise<T[]>(resolve => {
      this.#resolvePoll = resolve;

      // this will resolve the promise and delete waiters if batch ready.
      // otherwise, it'll keep waiting.
      this.pollIfReady();

      // if we're still polling at this point, it means a batch wasn't full
      // and it's not been enough time. Set a timer for the remaining time,
      // if one doesn't already exist.
      if (this.#resolvePoll === resolve && !this.#timer) {
        const tryAgainTime = this.#lastFlushTime + this.#timeout;
        this.#setTimeout(Math.max(0, Math.ceil(tryAgainTime - perf.now())));
      }
    }));
  }

  /**
   * For debugging/inspection: dump the current contents of the buffer,
   * without consuming or emitting anything.
   */
  public [Symbol.iterator](): Generator<I, void, unknown> {
    return this.#store[Symbol.iterator]();
  }

  /**
   * Empty the buffer and return all buffered items (if any);
   * This resets the timer, and resolves any pending polls with the
   * entire contents of the buffer.
   *
   * Note that this might result in sending a batch that is oversized,
   * or undersized and not yet timed out!
   *
   * Returns `undefined` if buffer is currently empty.
   */
  public flush(): undefined | T[] {
    this.#lastFlushTime = perf.now();
    if (this.empty) return undefined;
    const batch = this[GET_BATCH](this.size, this.#store);
    this.#resolve(batch);
    return batch;
  }

  /** drop all data */
  public clear(): void {
    this.#store.clear();
  }

  /**
   * drop oldest item/bucket.
   *
   * Used when overflowing in the `drop_oldest` policy.
   */
  protected [DROP_OLD](item: I, onDrop?: TelemetryBufferOnDropCallback<I>): void {
    onDrop?.(item, 'buffer_full_drop_oldest');
  }

  /** reset the timer value if there one is currently pending */
  #resetTimeout(n: number): void {
    if (this.#timer === undefined) return;
    this.#setTimeout(n);
  }

  /** clear any current pending timer, and set new one */
  #setTimeout(n: number): void {
    this.#clearTimeout();
    this.#timer = setTimeout(() => this.pollIfReady(), n);
    this.#timer.unref?.();
  }

  /** delete and clear pending timer */
  #clearTimeout(): void {
    if (this.#timer === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /**
   * Provide the items to pollers and clear pending actions
   *
   * NB: Only call with a batch that contains items!
   */
  #resolve(batch: T[]): void {
    if (this.#resolvePoll) {
      this.#resolvePoll(batch);
    }
    this.#clearTimeout();
    this.#resolvePoll = undefined;
    this.#polling = undefined;
  }

  /**
   * drop a single item from the store
   *
   * Used when rejecting writes in `drop_newest` policy.
   */
  protected abstract [REJECT_WRITE](item: T, onDrop: TelemetryBufferOnDropCallback<I>): void;

  /** add a single item to the store */
  protected abstract [ADD_ITEM](item: T, store: RingBuffer<I>): void;

  /** collect a batch of items to be sent */
  protected abstract [GET_BATCH](batchSize: number, store: RingBuffer<I>): T[];
}

/**
 * TelemetryBuffer for single items of all kinds other than Span
 */
export class TelemetryBuffer<T> extends TelemetryBufferBase<T, T> {
  protected [REJECT_WRITE](item: T, onDrop: TelemetryBufferOnDropCallback<T>): void {
    onDrop(item, 'buffer_full_drop_newest');
  }

  protected [ADD_ITEM](item: T, store: RingBuffer<T>): void {
    store.push(item);
  }

  protected [GET_BATCH](batchSize: number, store: RingBuffer<T>): T[] {
    const batch: T[] = [];
    const all = store.size <= batchSize;
    if (all) {
      // just take everything and then clear it out
      batch.push(...store);
      store.clear();
    } else {
      for (let i = 0; i < batchSize; i++) {
        const item = store.shift();
        if (item) batch.push(item);
      }
    }
    return batch;
  }
}

/**
 * A TelemetryBuffer class for Spans, bucketed by trace id
 */
export class TelemetrySpanBuffer extends TelemetryBufferBase<Span, Span[]> {
  #size: number;
  #capacity: number;
  #bucketById: Map<string, Span[]>;
  #getBucket (item: Span) {
    return item.spanContext().traceId;
  }

  public constructor(options: TelemetryBufferOptions<Span[]>) {
    super(options);
    const { capacity } = options;
    this.#capacity = capacity;
    this.#bucketById = new Map();
    this.#size = 0;
  }

  /** is the buffer full? */
  public get full(): boolean {
    return this.#size === this.#capacity;
  }

  /** number of items in the buffer */
  public get size(): number {
    return this.#size;
  }

  /** number of buckets currently buffered */
  public get bucketCount(): number {
    return super.size;
  }

  /** drop all data */
  public clear(): void {
    super.clear();
    this.#size = 0;
    this.#bucketById.clear();
  }

  protected [REJECT_WRITE](item: Span, onDrop: TelemetryBufferOnDropCallback<Span[]>): void {
    onDrop([item], 'buffer_full_drop_newest');
  }

  protected [DROP_OLD](bucket: Span[], onDrop?: TelemetryBufferOnDropCallback<Span[]>): void {
    this.#size -= bucket.length;
    const id = bucket[0] && this.#getBucket(bucket[0]);
    if (id) this.#bucketById.delete(id);
    super[DROP_OLD](bucket, onDrop);
  }

  protected [ADD_ITEM](item: Span, store: RingBuffer<Span[]>): void {
    const id = this.#getBucket(item);
    const bucket = this.#bucketById.get(id);
    if (bucket) {
      bucket.push(item);
    } else {
      const bucket = [item];
      store.push(bucket);
      this.#bucketById.set(id, bucket);
    }
    this.#size++;
  }

  /**
   * The span buffer only ever emits a batch representing a single
   * traceId, because a SpanEnvelope can only be spans from one trace.
   */
  protected [GET_BATCH](_: number, store: RingBuffer<Span[]>): Span[] {
    /* v8 ignore next - we know SOMETHING is here */
    const batch = store.shift() ?? [];
    console.error("SPAN BUFFER GET BATCH", batch)
    if (batch?.[0]) {
      this.#size -= batch.length;
      this.#bucketById.delete(this.#getBucket(batch[0]));
    }
    return batch;
  }
}
