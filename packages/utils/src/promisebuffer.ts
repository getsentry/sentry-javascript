import { SentryError } from './error';
import { SyncPromise } from './syncpromise';

/** A simple queue that holds promises. */
export class PromiseBuffer<T> {
  public constructor(protected _limit?: number) {}

  /** Internal set of queued Promises */
  private readonly _buffer: Array<PromiseLike<T>> = [];

  /**
   * Says if the buffer is ready to take more requests
   */
  public isReady(): boolean {
    return this._limit === undefined || this.length() < this._limit;
  }

  /**
   * Add a promise to the queue.
   *
   * @param task Can be any PromiseLike<T>
   * @returns The original promise.
   */
  public add(task: PromiseLike<T>): PromiseLike<T> {
    if (!this.isReady()) {
      return SyncPromise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    if (this._buffer.indexOf(task) === -1) {
      this._buffer.push(task);
    }
    task
      .then(() => this.remove(task))
      .then(null, () =>
        this.remove(task).then(null, () => {
          // We have to add this catch here otherwise we have an unhandledPromiseRejection
          // because it's a new Promise chain.
        }),
      );
    return task;
  }

  /**
   * Remove a promise to the queue.
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
   * This will drain the whole queue, returns true if queue is empty or drained.
   * If timeout is provided and the queue takes longer to drain, the promise still resolves but with false.
   *
   * @param timeout Number in ms to wait until it resolves with false.
   */
  public drain(timeout?: number): PromiseLike<boolean> {
    return new SyncPromise<boolean>(resolve => {
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);
      SyncPromise.all(this._buffer)
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
