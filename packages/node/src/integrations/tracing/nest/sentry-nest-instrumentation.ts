import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import {
  getActiveSpan,
  startSpan,
  startSpanManual,
  withActiveSpan,
  startInactiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SEMANTIC_ATTRIBUTE_CACHE_HIT
} from '@sentry/core';
import type { Span } from '@sentry/types';
import { SDK_VERSION } from '@sentry/utils';
import { getMiddlewareSpanOptions, isPatched } from './helpers';
import type { InjectableTarget, InjectTarget } from './types';

const supportedVersions = ['>=8.0.0 <11'];

const CACHE_MANAGER = 'CACHE_MANAGER';

/**
 * Custom instrumentation for nestjs.
 *
 * This hooks into the @Injectable decorator, which is applied on class middleware, interceptors and guards.
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

    moduleDef.files.push(this._getInjectableFileInstrumentation(supportedVersions), this._getInjectFileInstrumentation(supportedVersions));
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
   *
   */
  private _getInjectFileInstrumentation(versions: string[]): InstrumentationNodeModuleFile {
    return new InstrumentationNodeModuleFile(
      '@nestjs/common/decorators/core/inject.decorator.js',
      versions,
      (moduleExports: { Inject: InjectTarget }) => {
        if (isWrapped(moduleExports.Inject)) {
          this._unwrap(moduleExports, 'Inject');
        }
        this._wrap(moduleExports, 'Inject', this._createWrapInject());
        return moduleExports;
      },
      (moduleExports: { Inject: InjectTarget }) => {
        this._unwrap(moduleExports, 'Inject');
      },
    )
  }

  /**
   *
   */
  private _createWrapInject() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function wrapInject(original: any) {
      return function wrappedInject(token?: unknown) {
        return function (target: InjectTarget, key: string | symbol | undefined, index?: number) {
          if (token !== CACHE_MANAGER || target.prototype === undefined) {
            return original(token)(target, key, index);
          }

          if (index === undefined) {
            return original(token)(target, key, index);
          }

          // target is the service that injects the cache manager
          // TODO: retrieve cache manager so we can patch it

          console.log('bla: ', target.prototype.cacheManager);

          console.log('target: ', target);
          console.log('target prototype', target.prototype);
          console.log('property name: ', Object.getOwnPropertyNames(target.prototype));
          console.log('token: ', token);
          console.log('key: ', key);
          console.log('index: ', index);

          return original(token)(target, key, index);
        }
      }
    }
  }

  /**
   * Creates a wrapper function for the @Injectable decorator.
   *
   * Wraps the use method to instrument nest class middleware.
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
                const [executionContext, next, args] = argsIntercept;
                const prevSpan = getActiveSpan();

                return startSpanManual(getMiddlewareSpanOptions(target), (span: Span) => {
                  const nextProxy = new Proxy(next, {
                    get: (thisArgNext, property, receiver) => {
                      if (property === 'handle') {
                        const originalHandle = Reflect.get(thisArgNext, property, receiver);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return (...args: any[]) => {
                          span.end();

                          if (prevSpan) {
                            return withActiveSpan(prevSpan, () => {
                              return Reflect.apply(originalHandle, thisArgNext, args);
                            });
                          } else {
                            return Reflect.apply(originalHandle, thisArgNext, args);
                          }
                        };
                      }

                      return Reflect.get(target, property, receiver);
                    },
                  });

                  return originalIntercept.apply(thisArgIntercept, [executionContext, nextProxy, args]);
                });
              },
            });
          }

          return original(options)(target);
        };
      };
    };
  }
}
