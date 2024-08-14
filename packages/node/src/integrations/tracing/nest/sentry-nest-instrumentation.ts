import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { getActiveSpan, startInactiveSpan, startSpan, startSpanManual, withActiveSpan } from '@sentry/core';
import type { Span } from '@sentry/types';
import { SDK_VERSION } from '@sentry/utils';
import { getMiddlewareSpanOptions, isPatched } from './helpers';
import type {
  CallHandler,
  CatchTarget,
  InjectableTarget,
  MinimalNestJsExecutionContext,
  Observable,
  Subscription,
} from './types';

const supportedVersions = ['>=8.0.0 <11'];

/**
 * Custom instrumentation for nestjs.
 *
 * This hooks into
 * 1. @Injectable decorator, which is applied on class middleware, interceptors and guards.
 * 2. @Catch decorator, which is applied on exception filters.
 */
export class SentryNestInstrumentation extends InstrumentationBase {
  public static readonly COMPONENT = '@nestjs/common';
  public static readonly COMMON_ATTRIBUTES = {
    component: SentryNestInstrumentation.COMPONENT,
  };

  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-nestjs', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition {
    const moduleDef = new InstrumentationNodeModuleDefinition(SentryNestInstrumentation.COMPONENT, supportedVersions);

    moduleDef.files.push(
      this._getInjectableFileInstrumentation(supportedVersions),
      this._getCatchFileInstrumentation(supportedVersions),
    );
    return moduleDef;
  }

  /**
   * Wraps the @Injectable decorator.
   */
  private _getInjectableFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/common/decorators/core/injectable.decorator.js',
      versions,
      (moduleExports: { Injectable: InjectableTarget }) => {
        if (isWrapped(moduleExports.Injectable)) {
          this._unwrap(moduleExports, 'Injectable');
        }
        this._wrap(moduleExports, 'Injectable', this._createWrapInjectable());
        return moduleExports;
      },
      (moduleExports: { Injectable: InjectableTarget }) => {
        this._unwrap(moduleExports, 'Injectable');
      },
    );
  }

  /**
   * Wraps the @Catch decorator.
   */
  private _getCatchFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/common/decorators/core/catch.decorator.js',
      versions,
      (moduleExports: { Catch: CatchTarget }) => {
        if (isWrapped(moduleExports.Catch)) {
          this._unwrap(moduleExports, 'Catch');
        }
        this._wrap(moduleExports, 'Catch', this._createWrapCatch());
        return moduleExports;
      },
      (moduleExports: { Catch: CatchTarget }) => {
        this._unwrap(moduleExports, 'Catch');
      },
    );
  }

  /**
   * Creates a wrapper function for the @Injectable decorator.
   */
  private _createWrapInjectable() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapInjectable(original: any) {
      return function wrappedInjectable(options?: unknown) {
        return function (target: InjectableTarget) {
          // patch middleware
          if (typeof target.prototype.use === 'function' && !target.__SENTRY_INTERNAL__) {
            // patch only once
            if (isPatched(target)) {
              return original(options)(target);
            }

            target.prototype.use = new Proxy(target.prototype.use, {
              apply: (originalUse, thisArgUse, argsUse) => {
                const [req, res, next, ...args] = argsUse;
                const prevSpan = getActiveSpan();

                return startSpanManual(getMiddlewareSpanOptions(target), (span: Span) => {
                  const nextProxy = new Proxy(next, {
                    apply: (originalNext, thisArgNext, argsNext) => {
                      span.end();

                      if (prevSpan) {
                        return withActiveSpan(prevSpan, () => {
                          return Reflect.apply(originalNext, thisArgNext, argsNext);
                        });
                      } else {
                        return Reflect.apply(originalNext, thisArgNext, argsNext);
                      }
                    },
                  });

                  return originalUse.apply(thisArgUse, [req, res, nextProxy, args]);
                });
              },
            });
          }

          // patch guards
          if (typeof target.prototype.canActivate === 'function' && !target.__SENTRY_INTERNAL__) {
            // patch only once
            if (isPatched(target)) {
              return original(options)(target);
            }

            target.prototype.canActivate = new Proxy(target.prototype.canActivate, {
              apply: (originalCanActivate, thisArgCanActivate, argsCanActivate) => {
                return startSpan(getMiddlewareSpanOptions(target), () => {
                  return originalCanActivate.apply(thisArgCanActivate, argsCanActivate);
                });
              },
            });
          }

          // patch pipes
          if (typeof target.prototype.transform === 'function' && !target.__SENTRY_INTERNAL__) {
            if (isPatched(target)) {
              return original(options)(target);
            }

            target.prototype.transform = new Proxy(target.prototype.transform, {
              apply: (originalTransform, thisArgTransform, argsTransform) => {
                return startSpan(getMiddlewareSpanOptions(target), () => {
                  return originalTransform.apply(thisArgTransform, argsTransform);
                });
              },
            });
          }

          // patch interceptors
          if (typeof target.prototype.intercept === 'function' && !target.__SENTRY_INTERNAL__) {
            if (isPatched(target)) {
              return original(options)(target);
            }

            target.prototype.intercept = new Proxy(target.prototype.intercept, {
              apply: (originalIntercept, thisArgIntercept, argsIntercept) => {
                const context: MinimalNestJsExecutionContext = argsIntercept[0];
                const next: CallHandler = argsIntercept[1];
                const request = context.switchToHttp().getRequest();

                const prevSpan = getActiveSpan();
                let afterSpan: Span;

                return startSpanManual(getMiddlewareSpanOptions(target), (span: Span) => {
                  // eslint-disable-next-line @typescript-eslint/unbound-method
                  next.handle = new Proxy(next.handle, {
                    apply: (originalHandle, thisArgHandle, argsHandle) => {
                      span.end();

                      if (prevSpan) {
                        return withActiveSpan(prevSpan, () => {
                          const handleReturnObservable = Reflect.apply(originalHandle, thisArgHandle, argsHandle);
                          if (request.AFTER_ROUTE_SPAN_KEY) {
                            return handleReturnObservable;
                          }

                          afterSpan = startInactiveSpan(getMiddlewareSpanOptions(target, 'Interceptor - After Route'));
                          return handleReturnObservable;
                        });
                      } else {
                        const handleReturnObservable = Reflect.apply(originalHandle, thisArgHandle, argsHandle);

                        if (request.AFTER_ROUTE_SPAN_KEY) {
                          return handleReturnObservable;
                        }

                        afterSpan = startInactiveSpan(getMiddlewareSpanOptions(target, 'Interceptor - After Route'));
                        return handleReturnObservable;
                      }
                    },
                  });

                  // TODO: maybe promise<observable>
                  const returnedObservableIntercept: Observable<unknown> = originalIntercept.apply(
                    thisArgIntercept,
                    argsIntercept,
                  );

                  if (request.AFTER_ROUTE_SPAN_KEY) {
                    return returnedObservableIntercept;
                  }

                  if (typeof returnedObservableIntercept.subscribe === 'function') {
                    // eslint-disable-next-line @typescript-eslint/unbound-method
                    returnedObservableIntercept.subscribe = new Proxy(returnedObservableIntercept.subscribe, {
                      apply: (originalSubscribe, thisArgSubscribe, argsSubscribe) => {
                        return withActiveSpan(afterSpan ?? prevSpan, () => {
                          const subscription: Subscription = originalSubscribe.apply(thisArgSubscribe, argsSubscribe);
                          subscription.add(() => afterSpan.end());
                          return subscription;
                        });
                      },
                    });
                  }

                  request.AFTER_ROUTE_SPAN_KEY = true;
                  return returnedObservableIntercept;
                });
              },
            });
          }

          return original(options)(target);
        };
      };
    };
  }

  /**
   * Creates a wrapper function for the @Catch decorator. Used to instrument exception filters.
   */
  private _createWrapCatch() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapCatch(original: any) {
      return function wrappedCatch(...exceptions: unknown[]) {
        return function (target: CatchTarget) {
          if (typeof target.prototype.catch === 'function' && !target.__SENTRY_INTERNAL__) {
            // patch only once
            if (isPatched(target)) {
              return original(...exceptions)(target);
            }

            target.prototype.catch = new Proxy(target.prototype.catch, {
              apply: (originalCatch, thisArgCatch, argsCatch) => {
                return startSpan(getMiddlewareSpanOptions(target), () => {
                  return originalCatch.apply(thisArgCatch, argsCatch);
                });
              },
            });
          }

          return original(...exceptions)(target);
        };
      };
    };
  }
}
