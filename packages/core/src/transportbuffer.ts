/** A simple queue that holds promises. */
export class TransportBuffer<T> {
  /** Internal set of queued Promises */
  private readonly buffer: Set<Promise<T>> = new Set();

  /**
   * Add a promise to the queue.
   *
   * @param task Can be any Promise<T>
   * @returns The original promise.
   */
  public async add(task: Promise<T>): Promise<T> {
    this.buffer.add(task);
    task.then(() => this.buffer.delete(task)).catch(() => this.buffer.delete(task));
    return task;
  }

  /**
   * This function returns the number of unresolved promises in the queue.
   */
  public length(): number {
    return this.buffer.size;
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
      Promise.all(this.buffer.values())
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
