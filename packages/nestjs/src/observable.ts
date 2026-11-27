import type { Span } from '@sentry/core';
import { withActiveSpan } from '@sentry/core';

export interface Subscription {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add(...args: any[]): void;
}

/**
 * A minimal interface for an Observable.
 */
export interface Observable<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscribe(next?: (value: T) => void, error?: (err: any) => void, complete?: () => void): Subscription;
}

/**
 * Adds instrumentation to a js observable and attaches the span to an active
 * parent span.
 */
export function instrumentObservable(
  observable: Observable<unknown>,
  activeSpan: Span | undefined,
  onError?: (error: unknown) => void,
): void {
  if (activeSpan) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    observable.subscribe = new Proxy(observable.subscribe, {
      apply: (originalSubscribe, thisArgSubscribe, argsSubscribe) => {
        return withActiveSpan(activeSpan, () => {
          const subscribeArgs = onError ? withErrorCallback(argsSubscribe, onError) : argsSubscribe;
          const subscription: Subscription = originalSubscribe.apply(thisArgSubscribe, subscribeArgs);
          subscription.add(() => activeSpan.end());
          return subscription;
        });
      },
    });
  }
}

/** Returns `subscribe()` arguments whose error handler calls `onError` first. */
function withErrorCallback(args: unknown[], onError: (error: unknown) => void): unknown[] {
  const [observer] = args;

  // RxJS ignores the positional callbacks when it gets an observer object, so the object's `error` is the
  // one that runs. Nest subscribes this way, with a Subscriber.
  if (observer && typeof observer === 'object') {
    return [wrapObserver(observer, onError), ...args.slice(1)];
  }

  const wrapped = [...args];
  wrapped[1] = wrapErrorHandler(args[1], onError);
  return wrapped;
}

function wrapObserver(observer: object, onError: (error: unknown) => void): object {
  return new Proxy(observer, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'error') {
        return wrapErrorHandler(value, onError, target);
      }
      // A Subscriber's methods read its own private state, so they must run with the observer as `this`,
      // not the proxy.
      if ((property === 'next' || property === 'complete') && typeof value === 'function') {
        return (...args: unknown[]) => Reflect.apply(value, target, args);
      }
      return value;
    },
  });
}

function wrapErrorHandler(
  errorHandler: unknown,
  onError: (error: unknown) => void,
  thisArg?: unknown,
): (this: unknown, error: unknown) => unknown {
  return function (this: unknown, error: unknown): unknown {
    onError(error);
    // Without a handler, rethrowing lets RxJS report the error as unhandled, as it would without the wrapper.
    if (typeof errorHandler !== 'function') {
      throw error;
    }
    return Reflect.apply(errorHandler, thisArg ?? this, [error]);
  };
}
