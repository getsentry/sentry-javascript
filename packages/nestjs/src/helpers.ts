import type { Span } from '@sentry/core';
import { isObjectLike, withActiveSpan } from '@sentry/core';

/**
 * Determines if the exception is an expected NestJS control flow error.
 * - HttpException have getStatus and getResponse methods: https://github.com/nestjs/nest/blob/master/packages/microservices/exceptions/rpc-exception.ts
 * - RpcException have getError and initMessage methods: https://github.com/nestjs/nest/blob/master/packages/common/exceptions/http.exception.ts
 *
 * We cannot use `instanceof HttpException` here because this file is imported
 * from the main entry point (via decorators.ts), and importing @nestjs/common at that
 * point would load it before OpenTelemetry instrumentation can patch it, breaking instrumentations.
 *
 * @returns `true` if the exception is expected and should not be reported to Sentry, otherwise `false`.
 */
export function isExpectedError(exception: unknown): boolean {
  if (!isObjectLike(exception)) {
    return false;
  }

  // HttpException
  if (
    typeof exception.getStatus === 'function' &&
    typeof exception.getResponse === 'function' &&
    typeof exception.initMessage === 'function'
  ) {
    return true;
  }

  if (isWsOrRpcException(exception)) {
    return true;
  }

  return false;
}

/**
 * Determines if the exception is a WsException or RpcException, which have the same shape.
 * Both have `getError()` and `initMessage()` methods.
 *
 * We use duck-typing to avoid importing from `@nestjs/websockets` or `@nestjs/microservices`.
 */
export function isWsOrRpcException(exception: unknown): boolean {
  if (!isObjectLike(exception)) {
    return false;
  }

  return typeof exception.getError === 'function' && typeof exception.initMessage === 'function';
}

/**
 * The subset of `reflect-metadata`'s `Reflect` augmentation that NestJS
 * relies on. Methods are optional because `reflect-metadata` may not be
 * loaded; guard each before use.
 */
export interface ReflectWithMetadata {
  getMetadataKeys?: (target: object) => unknown[];
  getMetadata?: (key: unknown, target: object) => unknown;
  defineMetadata?: (key: unknown, value: unknown, target: object) => void;
}

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
          const subscribeArgs = [...argsSubscribe];

          if (onError) {
            const observer = argsSubscribe[0];
            if (observer && typeof observer === 'object') {
              subscribeArgs[0] = new Proxy(observer, {
                get(target, property) {
                  if (property !== 'error') {
                    const value = Reflect.get(target, property, target);
                    if ((property === 'next' || property === 'complete') && typeof value === 'function') {
                      return (...args: unknown[]) => Reflect.apply(value, target, args);
                    }
                    return value;
                  }

                  const errorHandler = Reflect.get(target, property, target);
                  return function (this: unknown, error: unknown): unknown {
                    onError(error);
                    if (typeof errorHandler !== 'function') {
                      throw error;
                    }
                    return Reflect.apply(errorHandler, target, [error]);
                  };
                },
              });
            } else {
              // RxJS ignores positional callbacks when the first argument is an observer object.
              const errorHandler = argsSubscribe[1];
              subscribeArgs[1] = function (this: unknown, error: unknown): unknown {
                onError(error);
                if (typeof errorHandler !== 'function') {
                  throw error;
                }
                return Reflect.apply(errorHandler, this, [error]);
              };
            }
          }

          const subscription: Subscription = originalSubscribe.apply(thisArgSubscribe, subscribeArgs);
          subscription.add(() => activeSpan.end());
          return subscription;
        });
      },
    });
  }
}
