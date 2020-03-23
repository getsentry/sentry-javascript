import { isThenable } from './is';

/** SyncPromise internal states */
enum States {
  /** Pending */
  PENDING = 'PENDING',
  /** Resolved / OK */
  RESOLVED = 'RESOLVED',
  /** Rejected / Error */
  REJECTED = 'REJECTED',
}

/**
 * Thenable class that behaves like a Promise and follows it's interface
 * but is not async internally
 */
class SyncPromise<T> implements PromiseLike<T> {
  private _state: States = States.PENDING;
  private _handlers: Array<{
    done: boolean;
    onfulfilled?: ((value: T) => T | PromiseLike<T>) | null;
    onrejected?: ((reason: any) => any) | null;
  }> = [];
  private _value: any;

  public constructor(
    executor: (resolve: (value?: T | PromiseLike<T> | null) => void, reject: (reason?: any) => void) => void,
  ) {
    try {
      executor(this._resolve, this._reject);
    } catch (e) {
      this._reject(e);
    }
  }

  /** JSDoc */
  public toString(): string {
    return '[object SyncPromise]';
  }

  /** JSDoc */
  public static resolve<T>(value: T | PromiseLike<T>): PromiseLike<T> {
    return new SyncPromise(resolve => {
      resolve(value);
    });
  }

  /** JSDoc */
  public static reject<T = never>(reason?: any): PromiseLike<T> {
    return new SyncPromise((_, reject) => {
      reject(reason);
    });
  }

  /** JSDoc */
  public static all<U = any>(collection: Array<U | PromiseLike<U>>): PromiseLike<U[]> {
    return new SyncPromise<U[]>((resolve, reject) => {
      if (!Array.isArray(collection)) {
        reject(new TypeError(`Promise.all requires an array as input.`));
        return;
      }

      if (collection.length === 0) {
        resolve([]);
        return;
      }

      let counter = collection.length;
      const resolvedCollection: U[] = [];

      collection.forEach((item, index) => {
        SyncPromise.resolve(item)
          .then(value => {
            resolvedCollection[index] = value;
            counter -= 1;

            if (counter !== 0) {
              return;
            }
            resolve(resolvedCollection);
          })
          .then(null, reject);
      });
    });
  }

  /** JSDoc */
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return new SyncPromise((resolve, reject) => {
      this._attachHandler({
        done: false,
        onfulfilled: result => {
          if (!onfulfilled) {
            // TODO: ¯\_(ツ)_/¯
            // TODO: FIXME
            resolve(result as any);
            return;
          }
          try {
            resolve(onfulfilled(result));
            return;
          } catch (e) {
            reject(e);
            return;
          }
        },
        onrejected: reason => {
          if (!onrejected) {
            reject(reason);
            return;
          }
          try {
            resolve(onrejected(reason));
            return;
          } catch (e) {
            reject(e);
            return;
          }
        },
      });
    });
  }

  /** JSDoc */
  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): PromiseLike<T | TResult> {
    return this.then(val => val, onrejected);
  }

  /** JSDoc */
  public finally<TResult>(onfinally?: (() => void) | null): PromiseLike<TResult> {
    return new SyncPromise<TResult>((resolve, reject) => {
      let val: TResult | any;
      let isRejected: boolean;

      return this.then(
        value => {
          isRejected = false;
          val = value;
          if (onfinally) {
            onfinally();
          }
        },
        reason => {
          isRejected = true;
          val = reason;
          if (onfinally) {
            onfinally();
          }
        },
      ).then(() => {
        if (isRejected) {
          reject(val);
          return;
        }

        resolve((val as unknown) as any);
      });
    });
  }

  /** JSDoc */
  private readonly _resolve = (value?: T | PromiseLike<T> | null) => {
    this._setResult(States.RESOLVED, value);
  };

  /** JSDoc */
  private readonly _reject = (reason?: any) => {
    this._setResult(States.REJECTED, reason);
  };

  /** JSDoc */
  private readonly _setResult = (state: States, value?: T | PromiseLike<T> | any) => {
    if (this._state !== States.PENDING) {
      return;
    }

    if (isThenable(value)) {
      (value as PromiseLike<T>).then(this._resolve, this._reject);
      return;
    }

    this._state = state;
    this._value = value;

    this._executeHandlers();
  };

  // TODO: FIXME
  /** JSDoc */
  private readonly _attachHandler = (handler: {
    /** JSDoc */
    done: boolean;
    /** JSDoc */
    onfulfilled?(value: T): any;
    /** JSDoc */
    onrejected?(reason: any): any;
  }) => {
    this._handlers = this._handlers.concat(handler);
    this._executeHandlers();
  };

  /** JSDoc */
  private readonly _executeHandlers = () => {
    if (this._state === States.PENDING) {
      return;
    }

    const cachedHandlers = this._handlers.slice();
    this._handlers = [];

    cachedHandlers.forEach(handler => {
      if (handler.done) {
        return;
      }

      if (this._state === States.RESOLVED) {
        if (handler.onfulfilled) {
          handler.onfulfilled((this._value as unknown) as any);
        }
      }

      if (this._state === States.REJECTED) {
        if (handler.onrejected) {
          handler.onrejected(this._value);
        }
      }

      handler.done = true;
    });
  };
}

export { SyncPromise };
