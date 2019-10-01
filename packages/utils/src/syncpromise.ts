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

// declare type PromiseConstructorLike = new <T>(executor: (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) => PromiseLike<T>;

// interface PromiseLike<T> {
//     /**
//      * Attaches callbacks for the resolution and/or rejection of the Promise.
//      * @param onfulfilled The callback to execute when the Promise is resolved.
//      * @param onrejected The callback to execute when the Promise is rejected.
//      * @returns A Promise for the completion of which ever callback is executed.
//      */
//     then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2>;
// }

// /**
//  * Represents the completion of an asynchronous operation
//  */
// interface Promise<T> {
//     /**
//      * Attaches callbacks for the resolution and/or rejection of the Promise.
//      * @param onfulfilled The callback to execute when the Promise is resolved.
//      * @param onrejected The callback to execute when the Promise is rejected.
//      * @returns A Promise for the completion of which ever callback is executed.
//      */
//     then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;

//     /**
//      * Attaches a callback for only the rejection of the Promise.
//      * @param onrejected The callback to execute when the Promise is rejected.
//      * @returns A Promise for the completion of the callback.
//      */
//     catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult>;
// }

// interface Handler<TResult1 = T, TResult2> {
//   onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null;
//   onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null;
// }
export class SyncPromise<T> implements Promise<T> {
  private _state: States = States.PENDING;
  // private _handlers: Array<Handler<T, any>> = [];
  private _value: any;

  public constructor(
    executor: (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
  ) {
    try {
      executor(this._resolve, this._reject);
    } catch (e) {
      this._reject(e);
    }
  }

  public toString(): string {
    return '[object SyncPromise]';
  }

  public [Symbol.toStringTag]: string = '[object SyncPromise]';

  // resolve<T>(value: T | PromiseLike<T>): Promise<T>;
  // resolve(): Promise<void>;

  public static resolve<T>(value: T | PromiseLike<T>): Promise<T> {
    return new Promise((resolve, reject) => {});
    // return new SyncPromise<U>(resolve => {
    //   resolve(value);
    // });
  }

  public static reject<T = never>(reason?: any): Promise<T> {
    return new Promise((resolve, reject) => {});
    // return new SyncPromise<U>((_, reject) => {
    //   reject(reason);
    // });
  }

  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return new Promise((resolve, reject) => {});

    // return new SyncPromise<TResult1 | TResult2>((resolve, reject) => {
    //   this._attachHandler({
    //     onFail: reason => {
    //       if (!onrejected) {
    //         reject(reason);
    //         return;
    //       }
    //       try {
    //         resolve(onrejected(reason));
    //         return;
    //       } catch (e) {
    //         reject(e);
    //         return;
    //       }
    //     },
    //     onSuccess: result => {
    //       if (!onfulfilled) {
    //         resolve(result);
    //         return;
    //       }
    //       try {
    //         resolve(onfulfilled(result));
    //         return;
    //       } catch (e) {
    //         reject(e);
    //         return;
    //       }
    //     },
    //   });
    // });
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<T | TResult> {
    return new Promise((resolve, reject) => {});
    // tslint:disable-next-line:no-unsafe-any
    // return this.then<U>((val: any) => val, onFail as any);
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return new Promise((resolve, reject) => {});
  }

  private _resolve(value?: T | PromiseLike<T>): void {
    // this._setResult(value, States.RESOLVED);
  }

  private _reject(reason?: any): void {
    // this._setResult(reason, States.REJECTED);
  }

  // private readonly _setResult = (value: T | any, state: States) => {
  //   if (this._state !== States.PENDING) {
  //     return;
  //   }

  //   if (isThenable(value)) {
  //     (value as Thenable<T>).then(this._resolve, this._reject);
  //     return;
  //   }

  //   this._value = value;
  //   this._state = state;

  //   this._executeHandlers();
  // };

  // private readonly _executeHandlers = () => {
  //   if (this._state === States.PENDING) {
  //     return;
  //   }

  //   if (this._state === States.REJECTED) {
  //     // tslint:disable-next-line:no-unsafe-any
  //     this._handlers.forEach(h => h.onFail && h.onFail(this._value));
  //   } else {
  //     // tslint:disable-next-line:no-unsafe-any
  //     this._handlers.forEach(h => h.onSuccess && h.onSuccess(this._value));
  //   }

  //   this._handlers = [];
  //   return;
  // };

  // private readonly _attachHandler = (handler: Handler<T, any>) => {
  //   this._handlers = this._handlers.concat(handler);
  //   this._executeHandlers();
  // };
}
