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

type PromiseExecutor<T> = (
  resolve: (value?: T | PromiseLike<T> | null) => void,
  reject: (reason?: any) => void,
) => void;

type Handler<T> = [boolean, (value: T) => void, (reason: any) => any];

export interface SyncPromise<T> extends PromiseLike<T> {
  getValue: () => T | undefined;
  finally: (onfinally?: (() => void) | null) => PromiseLike<T>;
  catch: <TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ) => PromiseLike<T | TResult>;
  resolve: (value: T | PromiseLike<T>) => PromiseLike<T>;
  reject: <T = never>(reason?: any) => PromiseLike<T>;
}
/**
 *
 * @param executor
 */
export function makeSyncPromise<T>(executor?: PromiseExecutor<T>): SyncPromise<T> {
  let _handlers: Array<Handler<T>> = [];
  let _state: States = States.PENDING;
  let _value: T | undefined = undefined;

  function getValue(): T | undefined {
    return _value;
  }

  function maybeExecuteHandlers() {
    if (_state === States.PENDING) {
      return;
    }

    const cachedHandlers = _handlers.slice();
    _handlers = [];

    cachedHandlers.forEach(handler => {
      if (handler[0]) {
        return;
      }

      if (_state === States.RESOLVED) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handler[1]((_value as unknown) as any);
      }

      if (_state === States.REJECTED) {
        handler[2](_value);
      }

      handler[0] = true;
    });
  }

  function _catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): PromiseLike<T | TResult> {
    return then(val => val, onrejected);
  }

  function resolve<T>(value: T | PromiseLike<T>): PromiseLike<T> {
    return makeSyncPromise(resolve => resolve(value));
  }

  function reject<T = never>(reason?: any): PromiseLike<T> {
    return makeSyncPromise((_, reject) => reject(reason));
  }

  function _resolve(value?: T | PromiseLike<T> | null): void {
    setResult(States.RESOLVED, value);
  }

  function _reject(reason?: any) {
    setResult(States.REJECTED, reason);
  }

  function setResult(state: States, value?: T | PromiseLike<T> | any) {
    if (_state !== States.PENDING) {
      return;
    }

    if (isThenable(value)) {
      void (value as PromiseLike<T>).then(_resolve, _reject);
      return;
    }

    _state = state;
    _value = value;

    maybeExecuteHandlers();
  }

  function then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return makeSyncPromise((resolve, reject) => {
      _handlers.push([
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

      maybeExecuteHandlers();
    });
  }

  function _finally<T>(onfinally?: (() => void) | null): PromiseLike<T> {
    return makeSyncPromise<T>((resolve, reject) => {
      let val: T | any;
      let isRejected: boolean;

      return then(
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

  if (executor) {
    try {
      executor(_resolve, _reject);
    } catch (e) {
      _reject(e);
    }
  }

  const promise: SyncPromise<T> = {
    getValue,
    then,
    finally: _finally,
    catch: _catch,
    resolve,
    reject,
  };

  return promise;
}
