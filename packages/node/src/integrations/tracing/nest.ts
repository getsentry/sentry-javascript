import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  InstrumentationNodeModuleFile,
} from '@opentelemetry/instrumentation';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getActiveSpan,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
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

const sentryPatched = Symbol('sentryPatched');

/**
 * Represents an injectable target class in NestJS.
 */
interface InjectableTarget {
  name: string;
  sentryPatched?: symbol;
  prototype: {
    use?: (req: unknown, res: unknown, next: (error?: Error | unknown) => void) => void;
  };
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
    super('sentry-nestjs', '1.0.0', config); // TODO: instrumentationVersion
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
          // ensure class has not been patched before
          if (target.sentryPatched) {
            return original(options)(target);
          } else {
            Object.defineProperty(target, sentryPatched, { value: true });
          }

          // patch middleware
          if (typeof target.prototype.use === 'function') {
            const originalUse = target.prototype.use;

            target.prototype.use = function (req: unknown, res: unknown, next: (error?: unknown) => void): void {
              const prevSpan = getActiveSpan();

              startSpanManual(
                {
                  name: target.name,
                  attributes: {
                    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'middleware.nestjs',
                    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.middleware.nestjs',
                  },
                },
                (span: Span) => {
                  // patch  next to end span before next middleware is being called
                  const wrappedNext = (error?: Error | unknown): void => {
                    span.end();

                    if (prevSpan) {
                      withActiveSpan(prevSpan, () => {
                        next(error);
                      });
                    } else {
                      next(error);
                    }
                  };

                  return originalUse.apply(this, [req, res, wrappedNext]);
                },
              );
            };
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

const instrumentMiddleware = generateInstrumentOnce('Nest-Middleware', () => {
  return new SentryNestInstrumentation();
});

export const instrumentNest = Object.assign(
  (): void => {
    instrumentNestCore();
    instrumentMiddleware();
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
          if (status_code !== undefined && status_code >= 400 && status_code < 500) {
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
