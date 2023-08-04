/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/typedef */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isThenable } from './is';

/** SyncPromise internal states */
const enum States {
  /** Pending */
  PENDING = 0,
  /** Resolved / OK */
  RESOLVED = 1,
  /** Rejected / Error */
  REJECTED = 2,
}

// Overloads so we can call resolvedSyncPromise without arguments and generic argument
export function resolvedSyncPromise(): PromiseLike<void>;
export function resolvedSyncPromise<T>(value: T | PromiseLike<T>): PromiseLike<T>;

/**
 * Creates a resolved sync promise.
 *
 * @param value the value to resolve the promise with
 * @returns the resolved sync promise
 */
export function resolvedSyncPromise<T>(value?: T | PromiseLike<T>): PromiseLike<T> {
  return new SyncPromise(resolve => {
    resolve(value);
  });
}

/**
 * Creates a rejected sync promise.
 *
 * @param value the value to reject the promise with
 * @returns the rejected sync promise
 */
export function rejectedSyncPromise<T = never>(reason?: any): PromiseLike<T> {
  return new SyncPromise((_, reject) => {
    reject(reason);
  });
}

/**
 * Thenable class that behaves like a Promise and follows it's interface
 * but is not async internally
 */
class SyncPromise<T> implements PromiseLike<T> {
  private _state: States;
  private _handlers: Array<[boolean, (value: T) => void, (reason: any) => any]>;
  private _value: any;

  public constructor(
    executor: (resolve: (value?: T | PromiseLike<T> | null) => void, reject: (reason?: any) => void) => void,
  ) {
    this._state = States.PENDING;
    this._handlers = [];

    try {
      executor(this._resolve, this._reject);
    } catch (e) {
      this._reject(e);
    }
  }

  /** JSDoc */
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return new SyncPromise((resolve, reject) => {
      this._handlers.push([
        false,
        result => {
          if (!onfulfilled) {
            // TODO: ¯\_(ツ)_/¯
            // TODO: FIXME
            resolve(result as any);
          } else {
            try {
              resolve(onfulfilled(result));
            } catch (e) {
              reject(e);
            }
          }
        },
        reason => {
          if (!onrejected) {
            reject(reason);
          } else {
            try {
              resolve(onrejected(reason));
            } catch (e) {
              reject(e);
            }
          }
        },
      ]);
      this._executeHandlers();
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

        resolve(val as unknown as any);
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
      void (value as PromiseLike<T>).then(this._resolve, this._reject);
      return;
    }

    this._state = state;
    this._value = value;

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
      if (handler[0]) {
        return;
      }

      if (this._state === States.RESOLVED) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handler[1](this._value as unknown as any);
      }

      if (this._state === States.REJECTED) {
        handler[2](this._value);
      }

      handler[0] = true;
    });
  };
}

export { SyncPromise };
