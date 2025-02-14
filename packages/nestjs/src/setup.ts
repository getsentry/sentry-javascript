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
import { captureException, getDefaultIsolationScope, getIsolationScope, logger } from '@sentry/core';
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
      logger.warn('Isolation scope is still the default isolation scope, skipping setting transactionName.');
      return next.handle();
    }

    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest() as FastifyRequest | ExpressRequest;
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
    // The BaseExceptionFilter does not work well in GraphQL applications.
    // By default, Nest GraphQL applications use the ExternalExceptionFilter, which just rethrows the error:
    // https://github.com/nestjs/nest/blob/master/packages/core/exceptions/external-exception-filter.ts
    if (host.getType<'graphql'>() === 'graphql') {
      // neither report nor log HttpExceptions
      if (exception instanceof HttpException) {
        throw exception;
      }

      if (exception instanceof Error) {
        this._logger.error(exception.message, exception.stack);
      }

      captureException(exception);
      throw exception;
    }

    if (!isExpectedError(exception)) {
      captureException(exception);
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
