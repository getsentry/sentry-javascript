import { isThenable } from './is';

/** JSDoc */
enum States {
  /** JSDoc */
  PENDING = 'PENDING',
  /** JSDoc */
  RESOLVED = 'RESOLVED',
  /** JSDoc */
  REJECTED = 'REJECTED',
}

/** JSDoc */
interface Handler<T, U> {
  onFail: HandlerOnFail<U>;
  onSuccess: HandlerOnSuccess<T, U>;
}

type HandlerOnSuccess<T, U = any> = (value: T) => U | Thenable<U>;
type HandlerOnFail<U = any> = (reason: any) => U | Thenable<U>;

/** JSDoc */
interface Thenable<T> {
  /** JSDoc */
  then<U>(onSuccess?: HandlerOnSuccess<T, U>, onFail?: HandlerOnFail<U> | ((reason: any) => void)): Thenable<U>;
}

type Resolve<R> = (value?: R | Thenable<R> | any) => void;
type Reject = (value?: any) => void;

/** JSDoc */
export class SyncPromise<T> implements PromiseLike<T> {
  /** JSDoc */
  private _state: States = States.PENDING;
  /** JSDoc */
  private _handlers: Array<Handler<T, any>> = [];
  /** JSDoc */
  private _value: T | any;

  public constructor(callback: (resolve: Resolve<T>, reject: Reject) => void) {
    try {
      callback(this._resolve, this._reject);
    } catch (e) {
      this._reject(e);
    }
  }

  /** JSDoc */
  private readonly _resolve = (value: T) => {
    this._setResult(value, States.RESOLVED);
  };

  /** JSDoc */
  private readonly _reject = (reason: any) => {
    this._setResult(reason, States.REJECTED);
  };

  /** JSDoc */
  private readonly _setResult = (value: T | any, state: States) => {
    if (this._state !== States.PENDING) {
      return;
    }

    if (isThenable(value)) {
      (value as Thenable<T>).then(this._resolve, this._reject);
      return;
    }

    this._value = value;
    this._state = state;

    this._executeHandlers();
  };

  /** JSDoc */
  private readonly _executeHandlers = () => {
    if (this._state === States.PENDING) {
      return;
    }

    if (this._state === States.REJECTED) {
      // tslint:disable-next-line:no-unsafe-any
      this._handlers.forEach(h => h.onFail && h.onFail(this._value));
    } else {
      // tslint:disable-next-line:no-unsafe-any
      this._handlers.forEach(h => h.onSuccess && h.onSuccess(this._value));
    }

    this._handlers = [];
    return;
  };

  /** JSDoc */
  private readonly _attachHandler = (handler: Handler<T, any>) => {
    this._handlers = this._handlers.concat(handler);
    this._executeHandlers();
  };

  /** JSDoc */
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): SyncPromise<TResult1 | TResult2> {
    // public then<U>(onSuccess?: HandlerOnSuccess<T, U>, onFail?: HandlerOnFail<U>): SyncPromise<T | U> {
    return new SyncPromise<TResult1 | TResult2>((resolve, reject) => {
      this._attachHandler({
        onFail: reason => {
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
        onSuccess: result => {
          if (!onfulfilled) {
            resolve(result);
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
      });
    });
  }

  /** JSDoc */
  public catch<U>(onFail: HandlerOnFail<U>): SyncPromise<U> {
    // tslint:disable-next-line:no-unsafe-any
    return this.then<U>((val: any) => val, onFail as any);
  }

  /** JSDoc */
  public toString(): string {
    return `[object SyncPromise]`;
  }

  /** JSDoc */
  public static resolve<U>(value?: U | Thenable<U>): SyncPromise<U> {
    return new SyncPromise<U>(resolve => {
      resolve(value);
    });
  }

  /** JSDoc */
  public static reject<U>(reason?: any): SyncPromise<U> {
    return new SyncPromise<U>((_, reject) => {
      reject(reason);
    });
  }
}
