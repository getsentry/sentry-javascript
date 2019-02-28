import { SentryError } from './error';

/** A simple queue that holds promises. */
export class PromiseBuffer<T> {
  public constructor(protected _limit?: number) {}

  /** Internal set of queued Promises */
  private readonly _buffer: Array<Promise<T>> = [];

  /**
   * Says if the buffer is ready to take more requests
   */
  public isReady(): boolean {
    return this._limit === undefined || this.length() < this._limit;
  }

  /**
   * Add a promise to the queue.
   *
   * @param task Can be any Promise<T>
   * @returns The original promise.
   */
  public async add(task: Promise<T>): Promise<T> {
    if (!this.isReady()) {
      return Promise.reject(new SentryError('Not adding Promise due to buffer limit reached.'));
    }
    if (this._buffer.indexOf(task) === -1) {
      this._buffer.push(task);
    }
    task
      .then(async () => this.remove(task))
      .catch(async () =>
        this.remove(task).catch(() => {
          // We have to add this catch here otherwise we have an unhandledPromiseRejection
          // because it's a new Promise chain.
        }),
      );
    return task;
  }

  /**
   * Remove a promise to the queue.
   *
   * @param task Can be any Promise<T>
   * @returns Removed promise.
   */
  public async remove(task: Promise<T>): Promise<T> {
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
  public async drain(timeout?: number): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);
      Promise.all(this._buffer)
        .then(() => {
          clearTimeout(capturedSetTimeout);
          resolve(true);
        })
        .catch(() => {
          resolve(true);
        });
    });
  }
}
