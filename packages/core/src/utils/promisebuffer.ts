import { rejectedSyncPromise, resolvedSyncPromise } from './syncpromise';
import { safeUnref } from './timer';

export interface PromiseBuffer<T> {
  // exposes the internal array so tests can assert on the state of it.
  // XXX: this really should not be public api.
  $: PromiseLike<T>[];
  add(taskProducer: () => PromiseLike<T>): PromiseLike<T>;
  drain(timeout?: number): PromiseLike<boolean>;
}

export const SENTRY_BUFFER_FULL_ERROR = Symbol.for('SentryBufferFullError');

/**
 * Creates an new PromiseBuffer object with the specified limit
 * @param limit max number of promises that can be stored in the buffer
 */
export function makePromiseBuffer<T>(limit: number = 100): PromiseBuffer<T> {
  const buffer: Set<PromiseLike<T>> = new Set();

  function isReady(): boolean {
    return buffer.size < limit;
  }

  /**
   * Remove a promise from the queue.
   *
   * @param task Can be any PromiseLike<T>
   * @returns Removed promise.
   */
  function remove(task: PromiseLike<T>): void {
    buffer.delete(task);
  }

  /**
   * Add a promise (representing an in-flight action) to the queue, and set it to remove itself on fulfillment.
   *
   * @param taskProducer A function producing any PromiseLike<T>; In previous versions this used to be `task:
   *        PromiseLike<T>`, but under that model, Promises were instantly created on the call-site and their executor
   *        functions therefore ran immediately. Thus, even if the buffer was full, the action still happened. By
   *        requiring the promise to be wrapped in a function, we can defer promise creation until after the buffer
   *        limit check.
   * @returns The original promise.
   */
  function add(taskProducer: () => PromiseLike<T>): PromiseLike<T> {
    if (!isReady()) {
      return rejectedSyncPromise(SENTRY_BUFFER_FULL_ERROR);
    }

    // start the task and add its promise to the queue
    const task = taskProducer();
    buffer.add(task);
    void task.then(
      () => remove(task),
      () => remove(task),
    );
    return task;
  }

  /**
   * Wait for all promises in the queue to resolve or for timeout to expire, whichever comes first.
   *
   * @param timeout The time, in ms, after which to resolve to `false` if the queue is still non-empty. Passing `0` (or
   * not passing anything) will make the promise wait as long as it takes for the queue to drain before resolving to
   * `true`.
   * @returns A promise which will resolve to `true` if the queue is already empty or drains before the timeout, and
   * `false` otherwise
   */
  function drain(timeout?: number): PromiseLike<boolean> {
    if (!buffer.size) {
      return resolvedSyncPromise(true);
    }

    // We want to resolve even if one of the promises rejects
    const drainPromise = Promise.allSettled(Array.from(buffer)).then(() => true);

    if (!timeout) {
      return drainPromise;
    }

    const promises = [
      drainPromise,
      new Promise<boolean>(resolve => safeUnref(setTimeout(() => resolve(false), timeout))),
    ];

    return Promise.race(promises);
  }

  return {
    get $(): PromiseLike<T>[] {
      return Array.from(buffer);
    },
    add,
    drain,
  };
}
