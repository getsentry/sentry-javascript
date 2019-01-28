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
  onSuccess: HandlerOnSuccess<T, U>;
  onFail: HandlerOnFail<U>;
}

type HandlerOnSuccess<T, U = any> = (value: T) => U | Thenable<U>;
type HandlerOnFail<U = any> = (reason: any) => U | Thenable<U>;
type Finally<U> = () => U | Thenable<U>;

/** JSDoc */
interface Thenable<T> {
  then<U>(onSuccess?: HandlerOnSuccess<T, U>, onFail?: HandlerOnFail<U> | ((reason: any) => void)): Thenable<U>;
}

type Resolve<R> = (value?: R | Thenable<R> | any) => void;
type Reject = (value?: any) => void;

/** JSDoc */
export class SyncPromise<T> {
  /** JSDoc */
  private state: States = States.PENDING;
  /** JSDoc */
  private handlers: Array<Handler<T, any>> = [];
  /** JSDoc */
  private value: T | any;

  public constructor(callback: (resolve: Resolve<T>, reject: Reject) => void) {
    try {
      callback(this.resolve, this.reject);
    } catch (e) {
      this.reject(e);
    }
  }

  /** JSDoc */
  private readonly resolve = (value: T) => {
    this.setResult(value, States.RESOLVED);
  };

  /** JSDoc */
  private readonly reject = (reason: any) => {
    this.setResult(reason, States.REJECTED);
  };

  /** JSDoc */
  private readonly setResult = (value: T | any, state: States) => {
    const set = () => {
      if (this.state !== States.PENDING) {
        return null;
      }

      if (isThenable(value)) {
        return (value as Thenable<T>).then(this.resolve, this.reject);
      }

      this.value = value;
      this.state = state;

      return this.executeHandlers();
    };

    set();
  };

  /** JSDoc */
  private readonly executeHandlers = () => {
    if (this.state === States.PENDING) {
      return null;
    }

    this.handlers.forEach(handler => {
      if (this.state === States.REJECTED) {
        // tslint:disable-next-line:no-unsafe-any
        return handler.onFail(this.value);
      }
      // tslint:disable-next-line:no-unsafe-any
      return handler.onSuccess(this.value);
    });

    this.handlers = [];
    return null;
  };

  /** JSDoc */
  private readonly attachHandler = (handler: Handler<T, any>) => {
    this.handlers = [...this.handlers, handler];

    this.executeHandlers();
  };

  /** JSDoc */
  public then<U>(onSuccess?: HandlerOnSuccess<T, U>, onFail?: HandlerOnFail<U>): SyncPromise<U | T> {
    return new SyncPromise<U | T>((resolve, reject) => {
      this.attachHandler({
        onFail: reason => {
          if (!onFail) {
            reject(reason);
            return;
          }

          try {
            resolve(onFail(reason));
            return;
          } catch (e) {
            reject(e);
            return;
          }
        },
        onSuccess: result => {
          if (!onSuccess) {
            resolve(result);
            return;
          }

          try {
            resolve(onSuccess(result));
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
  public catch<U>(onFail: HandlerOnFail<U>): SyncPromise<U | T> {
    // tslint:disable-next-line:no-unsafe-any
    return this.then<U>((val: any) => val, onFail);
  }

  /** JSDoc */
  public toString(): string {
    return `[object SyncPromise]`;
  }

  /** JSDoc */
  public finally<U>(cb: Finally<U>): SyncPromise<U> {
    return new SyncPromise<U>((resolve, reject) => {
      let val: U | any;
      let isRejected: boolean;

      return this.then(
        value => {
          isRejected = false;
          val = value;
          return cb();
        },
        reason => {
          isRejected = true;
          val = reason;
          return cb();
        },
      ).then(() => {
        if (isRejected) {
          reject(val);
          return;
        }

        // tslint:disable-next-line:no-unsafe-any
        resolve(val);
        return;
      });
    });
  }

  /** JSDoc */
  public static resolve<U = any>(value?: U | Thenable<U>): SyncPromise<U> {
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

// /** JSDoc */
// export enum PromiseState {
//   /** JSDoc */
//   PENDING,
//   /** JSDoc */
//   RESOLVED,
//   /** JSDoc */
//   REJECTED,
// }

// /** JSDoc*/
// interface Handle<T> {
//   onFulfilled?: ((value: T) => T | SyncPromise<T>);
//   onRejected?: ((reason: any) => void);
// }

// /** JSDoc */
// export class SyncPromise<T> {
//   /** JSDoc */
//   private value?: T | SyncPromise<T>;

//   /** JSDoc */
//   private reason?: any;

//   /** JSDoc */
//   private state: PromiseState = PromiseState.PENDING;
//   /** JSDoc */
//   private handlers: Array<Handle<T>> = [];

//   /** JSDoc*/
//   private readonly id: number = Math.random();

//   /** JSDoc */
//   public constructor(
//     callback: (
//       resolve: ((value: T) => T | SyncPromise<T>),
//       reject: ((reason: any) => never | SyncPromise<never> | void),
//     ) => void,
//   ) {
//     callback(
//       (value: T) => {
//         console.log('CTOR callback RESOLVE');
//         // console.log('res', this.donee);
//         this.value = value;
//         this.state = PromiseState.RESOLVED;
//         this.triggerHandlers();
//         return this.value;
//       },
//       (reason: any) => {
//         console.log('CTOR callback REJECT');
//         this.reason = reason;
//         this.state = PromiseState.REJECTED;
//         this.triggerHandlers();
//       },
//     );
//   }

//   /** JSDoc */
//   public then<TResult1 = T, TResult2 = never>(
//     onFulfilled?: ((value: T) => TResult1 | SyncPromise<TResult1>) | null,
//     onRejected?: ((reason: any) => TResult2 | SyncPromise<TResult2> | never | void) | null,
//   ): SyncPromise<TResult1 | TResult2> {
//     /** JSDoc */
//     // public then(
//     //   onFulfilled?: ((value: T) => T) | undefined | null,
//     //   onRejected?: ((reason: any) => never) | undefined | null,
//     // ): SyncPromise<T | never> {
//     return new SyncPromise((resolve, reject) => {
//       this.done(
//         result => {
//           console.log('onFulfilled!!!');
//           console.log('result:', result);
//           console.log('onFulfilled:', onFulfilled);
//           console.log('onRejected:', onRejected);
//           if (onFulfilled) {
//             try {
//               // @ts-ignore
//               return resolve(onFulfilled(result));
//             } catch (ex) {
//               return reject(ex);
//             }
//           } else {
//             // @ts-ignore
//             return resolve(result);
//           }
//         },
//         reason => {
//           console.log('onRejected!!!');
//           console.log('reason:', reason);
//           console.log('onFulfilled:', onFulfilled);
//           console.log('onRejected:', onRejected);
//           if (onRejected) {
//             try {
//               // @ts-ignore
//               return resolve(onRejected(reason));
//             } catch (ex) {
//               return reject(ex);
//             }
//           } else {
//             return reject(reason);
//           }
//         },
//       );
//     });
//   }

//   /** JSDoc*/
//   public catch(onRejected?: ((reason: any) => never | SyncPromise<never> | never | void)): SyncPromise<T | never> {
//     return this.then(null, onRejected);
//   }

//   /** JSDoc */
//   private handle(handler: Handle<T>): void {
//     console.log('*******************');
//     console.log('handle called with:');
//     console.log('this:', this);
//     console.log('handler.onFulfilled:', handler.onFulfilled);
//     console.log('handler.onRejected:', handler.onRejected);
//     console.log('*******************');

//     if (this.state === PromiseState.PENDING) {
//       this.handlers.push(handler);
//     } else if (this.state === PromiseState.RESOLVED && handler.onFulfilled) {
//       handler.onFulfilled(this.value as T);
//     } else if (this.state === PromiseState.REJECTED && handler.onRejected) {
//       handler.onRejected(this.reason);
//     }
//   }

//   /** JSDoc */
//   public done(
//     onFulfilled?: ((value: T) => T | SyncPromise<T>),
//     onRejected?: ((reason: any) => void | SyncPromise<never>),
//   ): void {
//     // console.log('done called');
//     this.handle({ onFulfilled, onRejected });
//   }

//   /** JSDoc */
//   private triggerHandlers(): void {
//     const callbacks = this.handlers;
//     this.handlers = [];
//     callbacks.forEach(call => {
//       this.handle(call);
//     });
//   }

//   /** JSDoc */
//   public static resolve<T>(value: T): SyncPromise<T> {
//     return new SyncPromise<T>(resolve => resolve(value));
//   }

//   /** JSDoc */
//   public static reject<T>(reason: any): SyncPromise<T> {
//     return new SyncPromise<T>((_, reject) => reject(reason));
//   }
// }

/*
enum PromiseState {
  INITIAL,
  RESOLVED,
  REJECTED,
};

class SyncPromise<T> {
  private value?: T | any;
  private state: PromiseState = PromiseState.INITIAL;
  private _callbacks: Array<any> = [];

  constructor(callback: (onResolve, onReject) => void) {
      callback((value: T) => {
          this.value = value;
          this.state = PromiseState.RESOLVED;
          this.triggerHandlers();
      }, (err: any) => {
          this.value = err;
          this.state = PromiseState.REJECTED;
          this.triggerHandlers();
      });
  }

  public then(onResolve, onReject): void {
      if (this.state != PromiseState.INITIAL) {
          this.triggerHandler(onResolve, onReject);
      } else {
          this._callbacks.push([onResolve, onReject]);
      }
  }

  private triggerHandler(onResolve, onReject): void {
      if (this.state == PromiseState.RESOLVED) {
          onResolve(this.value);
      } else {
          onReject(this.value);
      }
  }

  private triggerHandlers(): void {
      let callbacks = this._callbacks;
      this._callbacks = [];
      callbacks.forEach((onResolve, onReject) => {
          this.triggerHandler(onResolve, onReject);
      });
  }

  static resolve<T>(value: T): SyncPromise<T> {
      return new SyncPromise((resolve) => {
          resolve(value);
      });
  }

  static reject<T>(value: any): SyncPromise<T> {
      return new SyncPromise((_, reject) => {
          reject(value);
      });
  }
}*/
