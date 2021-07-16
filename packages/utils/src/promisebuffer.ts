import { SentryError } from './error';
import { SyncPromise } from './syncpromise';

/** A simple queue that holds promises. */
export class PromiseBuffer<T> {
  /** Internal set of queued Promises */
  private readonly _buffer: Array<PromiseLike<T>> = [];

  public constructor(protected _limit?: number) {}

  /**
   * Says if the buffer is ready to take more requests
   */
  public isReady(): boolean {
    return this._limit === undefined || this.length() < this._limit;
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
  public add(taskProducer: () => PromiseLike<T>): PromiseLike<T> {
    if (!this.isReady()) {
      return SyncPromise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }

    // start the task and add its promise to the queue
    const task = taskProducer();
    if (this._buffer.indexOf(task) === -1) {
      this._buffer.push(task);
    }
    void task
      .then(() => this.remove(task))
      // Use `then(null, rejectionHandler)` rather than `catch(rejectionHandler)` so that we can use `PromiseLike`
      // rather than `Promise`. `PromiseLike` doesn't have a `.catch` method, making its polyfill smaller. (ES5 didn't
      // have promises, so TS has to polyfill when down-compiling.)
      .then(null, () =>
        this.remove(task).then(null, () => {
          // We have to add another catch here because `this.remove()` starts a new promise chain.
        }),
      );
    return task;
  }

  /**
   * Remove a promise from the queue.
   *
   * @param task Can be any PromiseLike<T>
   * @returns Removed promise.
   */
  public remove(task: PromiseLike<T>): PromiseLike<T> {
    const removedTask = this._buffer.splice(this._buffer.indexOf(task), 1)[0];
    return removedTask;
  }

  /**
   * This function returns the number of unresolved promises in the queue.
   */
  public length(): number {
    return this._buffer.length;
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
  public drain(timeout?: number): PromiseLike<boolean> {
    return new SyncPromise<boolean>(resolve => {
      // wait for `timeout` ms and then resolve to `false` (if not cancelled first)
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);

      // if all promises resolve in time, cancel the timer and resolve to `true`
      void SyncPromise.all(this._buffer)
        .then(() => {
          clearTimeout(capturedSetTimeout);
          resolve(true);
        })
        .then(null, () => {
          resolve(true);
        });
    });
  }
}
