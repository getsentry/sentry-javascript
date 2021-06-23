import { SentryError } from './error';
import { isThenable } from './is';
import { SyncPromise } from './syncpromise';

type TaskProducer<T> = () => PromiseLike<T>;

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
   * Add a promise to the queue.
   *
   * @param taskProducer A function producing any PromiseLike<T>
   * @returns The original promise.
   */
  public add(taskProducer: PromiseLike<T> | TaskProducer<T>): PromiseLike<T> {
    // NOTE: This is necessary to preserve backwards compatibility
    // It should accept _only_ `TaskProducer<T>` but we dont want to break other custom transports
    // that are utilizing our `Buffer` implementation.
    // see: https://github.com/getsentry/sentry-javascript/issues/3725
    const normalizedTaskProducer: TaskProducer<T> = isThenable(taskProducer)
      ? () => taskProducer as PromiseLike<T>
      : (taskProducer as TaskProducer<T>);

    if (!this.isReady()) {
      return SyncPromise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    const task = normalizedTaskProducer();
    if (this._buffer.indexOf(task) === -1) {
      this._buffer.push(task);
    }
    void task
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
