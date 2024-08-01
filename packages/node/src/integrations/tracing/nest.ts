import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import {
  SDK_VERSION,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { addNonEnumerableProperty, logger } from '@sentry/utils';
import type { Observable } from 'rxjs';
import { generateInstrumentOnce } from '../../otel/instrument';

interface MinimalNestJsExecutionContext {
  getType: () => string;

  switchToHttp: () => {
    // minimal request object
    // according to official types, all properties are required but
    // let's play it safe and assume they're optional
    getRequest: () => {
      route?: {
        path?: string;
      };
      method?: string;
    };
  };
}

interface NestJsErrorFilter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(exception: any, host: any): void;
}

interface MinimalNestJsApp {
  useGlobalFilters: (arg0: NestJsErrorFilter) => void;
  useGlobalInterceptors: (interceptor: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intercept: (context: MinimalNestJsExecutionContext, next: { handle: () => any }) => any;
  }) => void;
}

const INTEGRATION_NAME = 'Nest';

const supportedVersions = ['>=8.0.0 <11'];

const sentryPatched = 'sentryPatched';

/**
 * A NestJS call handler. Used in interceptors to start the route execution.
 */
export interface CallHandler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(...args: any[]): Observable<any>;
}

/**
 * Represents an injectable target class in NestJS.
 */
export interface InjectableTarget {
  name: string;
  sentryPatched?: boolean;
  __SENTRY_INTERNAL__?: boolean;
  prototype: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    use?: (req: unknown, res: unknown, next: () => void, ...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canActivate?: (...args: any[]) => boolean | Promise<boolean> | Observable<boolean>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transform?: (...args: any[]) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intercept?: (context: unknown, next: CallHandler, ...args: any[]) => Observable<any>;
  };
}

/**
 * Helper checking if a concrete target class is already patched.
 *
 * We already guard duplicate patching with isWrapped. However, isWrapped checks whether a file has been patched, whereas we use this check for concrete target classes.
 * This check might not be necessary, but better to play it safe.
 */
export function isPatched(target: InjectableTarget): boolean {
  if (target.sentryPatched) {
    return true;
  }

  addNonEnumerableProperty(target, sentryPatched, true);
  return false;
}

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

    moduleDef.files.push(this._getInjectableFileInstrumentation(supportedVersions));
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

                return startSpanManual(
                  {
                    name: target.name,
                    attributes: {
                      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
                      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nestjs',
                    },
                  },
                  (span: Span) => {
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
                  },
                );
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
                return startSpan(
                  {
                    name: target.name,
                    attributes: {
                      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
                      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nestjs',
                    },
                  },
                  () => {
                    return originalCanActivate.apply(thisArgCanActivate, argsCanActivate);
                  },
                );
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
                return startSpan(
                  {
                    name: target.name,
                    attributes: {
                      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
                      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nestjs',
                    },
                  },
                  () => {
                    return originalTransform.apply(thisArgTransform, argsTransform);
                  },
                );
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

                return startSpanManual(
                  {
                    name: target.name,
                    attributes: {
                      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
                      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nestjs',
                    },
                  },
                  (span: Span) => {
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
                  },
                );
              },
            });
          }

          return original(options)(target);
        };
      };
    };
  }
}

const instrumentNestCore = generateInstrumentOnce('Nest-Core', () => {
  return new NestInstrumentation();
});

const instrumentNestCommon = generateInstrumentOnce('Nest-Common', () => {
  return new SentryNestInstrumentation();
});

export const instrumentNest = Object.assign(
  (): void => {
    instrumentNestCore();
    instrumentNestCommon();
  },
  { id: INTEGRATION_NAME },
);

const _nestIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentNest();
    },
  };
}) satisfies IntegrationFn;

/**
 * Nest framework integration
 *
 * Capture tracing data for nest.
 */
export const nestIntegration = defineIntegration(_nestIntegration);

/**
 * Setup an error handler for Nest.
 */
export function setupNestErrorHandler(app: MinimalNestJsApp, baseFilter: NestJsErrorFilter): void {
  // Sadly, NestInstrumentation has no requestHook, so we need to add the attributes here
  // We register this hook in this method, because if we register it in the integration `setup`,
  // it would always run even for users that are not even using Nest.js
  const client = getClient();
  if (client) {
    client.on('spanStart', span => {
      addNestSpanAttributes(span);
    });
  }

  app.useGlobalInterceptors({
    intercept(context, next) {
      if (getIsolationScope() === getDefaultIsolationScope()) {
        logger.warn('Isolation scope is still the default isolation scope, skipping setting transactionName.');
        return next.handle();
      }

      if (context.getType() === 'http') {
        const req = context.switchToHttp().getRequest();
        if (req.route) {
          getIsolationScope().setTransactionName(`${req.method?.toUpperCase() || 'GET'} ${req.route.path}`);
        }
      }

      return next.handle();
    },
  });

  const wrappedFilter = new Proxy(baseFilter, {
    get(target, prop, receiver) {
      if (prop === 'catch') {
        const originalCatch = Reflect.get(target, prop, receiver);

        return (exception: unknown, host: unknown) => {
          const status_code = (exception as { status?: number }).status;

          // don't report expected errors
          if (status_code !== undefined) {
            return originalCatch.apply(target, [exception, host]);
          }

          captureException(exception);
          return originalCatch.apply(target, [exception, host]);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  app.useGlobalFilters(wrappedFilter);
}

function addNestSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data || {};

  // this is one of: app_creation, request_context, handler
  const type = attributes['nestjs.type'];

  // If this is already set, or we have no nest.js span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.nestjs',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.nestjs`,
  });
}
