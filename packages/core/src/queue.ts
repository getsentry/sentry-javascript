export class Queue<T> {
  private queue: Set<Promise<T>> = new Set();

  public add(task: Promise<T>): Promise<T> {
    this.queue.add(task);
    task.then(() => this.queue.delete(task));
    return task;
  }

  public length(): number {
    return this.queue.size;
  }

  public drain(timeout?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          reject('Drain timeout reached');
        }
      }, timeout);
      Promise.all(this.queue.values()).then(() => {
        clearTimeout(capturedSetTimeout);
        resolve();
      });
    });
  }
}
