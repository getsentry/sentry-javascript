/* eslint-disable @typescript-eslint/no-explicit-any */
import { isThenable } from './is';

/** SyncPromise internal states */
const STATE_PENDING = 0;
const STATE_RESOLVED = 1;
const STATE_REJECTED = 2;

type State = typeof STATE_PENDING | typeof STATE_RESOLVED | typeof STATE_REJECTED;

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

type Executor<T> = (resolve: (value?: T | PromiseLike<T> | null) => void, reject: (reason?: any) => void) => void;

/**
 * Thenable class that behaves like a Promise and follows it's interface
 * but is not async internally
 */
export class SyncPromise<T> implements PromiseLike<T> {
  private _state: State;
  private _handlers: Array<[boolean, (value: T) => void, (reason: any) => any]>;
  private _value: any;

  public constructor(executor: Executor<T>) {
    this._state = STATE_PENDING;
    this._handlers = [];

    this._runExecutor(executor);
  }

  /** @inheritdoc */
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

  /** @inheritdoc */
  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): PromiseLike<T | TResult> {
    return this.then(val => val, onrejected);
  }

  /** @inheritdoc */
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

  /** Excute the resolve/reject handlers. */
  private _executeHandlers(): void {
    if (this._state === STATE_PENDING) {
      return;
    }

    const cachedHandlers = this._handlers.slice();
    this._handlers = [];

    cachedHandlers.forEach(handler => {
      if (handler[0]) {
        return;
      }

      if (this._state === STATE_RESOLVED) {
        handler[1](this._value as unknown as any);
      }

      if (this._state === STATE_REJECTED) {
        handler[2](this._value);
      }

      handler[0] = true;
    });
  }

  /** Run the executor for the SyncPromise. */
  private _runExecutor(executor: Executor<T>): void {
    const setResult = (state: State, value?: T | PromiseLike<T> | any): void => {
      if (this._state !== STATE_PENDING) {
        return;
      }

      if (isThenable(value)) {
        void (value as PromiseLike<T>).then(resolve, reject);
        return;
      }

      this._state = state;
      this._value = value;

      this._executeHandlers();
    };

    const resolve = (value: unknown): void => {
      setResult(STATE_RESOLVED, value);
    };

    const reject = (reason: unknown): void => {
      setResult(STATE_REJECTED, reason);
    };

    try {
      executor(resolve, reject);
    } catch (e) {
      reject(e);
    }
  }
}
