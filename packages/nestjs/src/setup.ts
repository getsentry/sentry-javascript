import type {
  ArgumentsHost,
  CallHandler,
  DynamicModule,
  ExecutionContext,
  HttpServer,
  NestInterceptor,
} from '@nestjs/common';
import { Catch, Global, HttpException, Injectable, Logger, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, BaseExceptionFilter } from '@nestjs/core';
import { captureException, debug, getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import type { Observable } from 'rxjs';
import { isExpectedError } from './helpers';

// Partial extract of FastifyRequest interface
// https://github.com/fastify/fastify/blob/87f9f20687c938828f1138f91682d568d2a31e53/types/request.d.ts#L41
interface FastifyRequest {
  routeOptions?: {
    url?: string;
  };
  method?: string;
}

// Partial extract of ExpressRequest interface
interface ExpressRequest {
  route?: {
    path?: string;
  };
  method?: string;
}

/**
 * Note: We cannot use @ syntax to add the decorators, so we add them directly below the classes as function wrappers.
 */

/**
 * Interceptor to add Sentry tracing capabilities to Nest.js applications.
 */
class SentryTracingInterceptor implements NestInterceptor {
  // used to exclude this class from being auto-instrumented
  public readonly __SENTRY_INTERNAL__: boolean;

  public constructor() {
    this.__SENTRY_INTERNAL__ = true;
  }

  /**
   * Intercepts HTTP requests to set the transaction name for Sentry tracing.
   */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (getIsolationScope() === getDefaultIsolationScope()) {
      debug.warn('Isolation scope is still the default isolation scope, skipping setting transactionName.');
      return next.handle();
    }

    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<FastifyRequest | ExpressRequest>();
      if ('routeOptions' in req && req.routeOptions?.url) {
        // fastify case
        getIsolationScope().setTransactionName(`${(req.method || 'GET').toUpperCase()} ${req.routeOptions.url}`);
      } else if ('route' in req && req.route?.path) {
        // express case
        getIsolationScope().setTransactionName(`${(req.method || 'GET').toUpperCase()} ${req.route.path}`);
      }
    }

    return next.handle();
  }
}
Injectable()(SentryTracingInterceptor);

/**
 * Global filter to handle exceptions and report them to Sentry.
 */
class SentryGlobalFilter extends BaseExceptionFilter {
  public readonly __SENTRY_INTERNAL__: boolean;
  private readonly _logger: Logger;

  public constructor(applicationRef?: HttpServer) {
    super(applicationRef);
    this.__SENTRY_INTERNAL__ = true;
    this._logger = new Logger('ExceptionsHandler');
  }

  /**
   * Catches exceptions and reports them to Sentry unless they are expected errors.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType<string>();

    // The BaseExceptionFilter does not work well in GraphQL applications.
    // By default, Nest GraphQL applications use the ExternalExceptionFilter, which just rethrows the error:
    // https://github.com/nestjs/nest/blob/master/packages/core/exceptions/external-exception-filter.ts
    if (contextType === 'graphql') {
      // neither report nor log HttpExceptions
      if (exception instanceof HttpException) {
        throw exception;
      }

      if (exception instanceof Error) {
        this._logger.error(exception.message, exception.stack);
      }

      captureException(exception, {
        mechanism: {
          handled: false,
          type: 'auto.graphql.nestjs.global_filter',
        },
      });
      throw exception;
    }

    // Handle microservice context (rpc)
    // We cannot add proper handing here since RpcException depend on the @nestjs/microservices package
    // For these cases we log a warning that the user should be providing a dedicated exception filter
    if (contextType === 'rpc') {
      // Unlikely case
      if (exception instanceof HttpException) {
        throw exception;
      }

      // Handle any other kind of error
      if (!(exception instanceof Error)) {
        if (!isExpectedError(exception)) {
          captureException(exception, {
            mechanism: {
              handled: false,
              type: 'auto.rpc.nestjs.global_filter',
            },
          });
        }
        throw exception;
      }

      // In this case we're likely running into an RpcException, which the user should handle with a dedicated filter
      // https://github.com/nestjs/nest/blob/master/sample/03-microservices/src/common/filters/rpc-exception.filter.ts
      if (!isExpectedError(exception)) {
        captureException(exception, {
          mechanism: {
            handled: false,
            type: 'auto.rpc.nestjs.global_filter',
          },
        });
      }

      this._logger.warn(
        'IMPORTANT: RpcException should be handled with a dedicated Rpc exception filter, not the generic SentryGlobalFilter',
      );

      // Log the error and return, otherwise we may crash the user's app by handling rpc errors in a http context
      this._logger.error(exception.message, exception.stack);
      return;
    }

    // HTTP exceptions
    if (!isExpectedError(exception)) {
      captureException(exception, {
        mechanism: {
          handled: false,
          type: 'auto.http.nestjs.global_filter',
        },
      });
    }

    return super.catch(exception, host);
  }
}
Catch()(SentryGlobalFilter);
export { SentryGlobalFilter };

/**
 * Set up a root module that can be injected in nest applications.
 */
class SentryModule {
  /**
   * Configures the module as the root module in a Nest.js application.
   */
  public static forRoot(): DynamicModule {
    return {
      module: SentryModule,
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: SentryTracingInterceptor,
        },
      ],
    };
  }
}
Global()(SentryModule);
Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryTracingInterceptor,
    },
  ],
})(SentryModule);
export { SentryModule };
