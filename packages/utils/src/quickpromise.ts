/** JSDoc */
export enum PromiseState {
  /** JSDoc */
  INITIAL,
  /** JSDoc */
  RESOLVED,
}

/** JSDoc */
export class QuickPromise<T> {
  /** JSDoc */
  private result?: T | QuickPromise<T>;
  /** JSDoc */
  private state: PromiseState = PromiseState.INITIAL;
  /** JSDoc */
  private callbacks: any[] = [];

  /** JSDoc */
  public constructor(callback: (resolve: (result: T) => void | QuickPromise<T>) => void) {
    callback((result: T) => {
      this.result = result;
      this.state = PromiseState.RESOLVED;
      this.triggerHandlers();
    });
  }

  /** JSDoc */
  public then(callback: (result: T) => void | QuickPromise<T>): void {
    if (this.state !== PromiseState.INITIAL) {
      this.triggerHandler(callback);
    } else {
      this.callbacks.push([callback]);
    }
  }

  /** JSDoc */
  private triggerHandler(callback: (result: T) => void | QuickPromise<T>): void {
    if (this.state === PromiseState.RESOLVED) {
      callback(this.result as T);
    }
  }

  /** JSDoc */
  private triggerHandlers(): void {
    const callbacks = this.callbacks;
    this.callbacks = [];
    callbacks.forEach(call => {
      this.triggerHandler(call[0]);
    });
  }

  /** JSDoc */
  public static resolve<T>(result: T): QuickPromise<T> {
    return new QuickPromise(resolve => {
      resolve(result);
    });
  }
}
