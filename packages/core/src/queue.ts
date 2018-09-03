export class Queue<T> {
  private queue: Set<Promise<T>> = new Set();

  public add(task: Promise<T>): Promise<T> {
    this.queue.add(task);
    task.then(() => this.queue.delete(task)).catch(() => this.queue.delete(task));
    return task;
  }

  public length(): number {
    return this.queue.size;
  }

  public drain(timeout?: number): Promise<boolean> {
    return new Promise(resolve => {
      const capturedSetTimeout = setTimeout(() => {
        if (timeout && timeout > 0) {
          resolve(false);
        }
      }, timeout);
      Promise.all(this.queue.values())
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
