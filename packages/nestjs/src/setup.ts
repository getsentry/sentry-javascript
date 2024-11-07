import type {
  ArgumentsHost,
  CallHandler,
  DynamicModule,
  ExecutionContext,
  NestInterceptor,
  OnModuleInit,
} from '@nestjs/common';
import { Catch, Global, HttpException, Injectable, Logger, Module } from '@nestjs/common';
import type { HttpServer } from '@nestjs/common';
import { APP_INTERCEPTOR, BaseExceptionFilter } from '@nestjs/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import type { Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import type { Observable } from 'rxjs';
import { isExpectedError } from './helpers';

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
      const req = context.switchToHttp().getRequest();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (req.route) {
        // eslint-disable-next-line @sentry-internal/sdk/no-optional-chaining,@typescript-eslint/no-unsafe-member-access
        getIsolationScope().setTransactionName(`${req.method?.toUpperCase() || 'GET'} ${req.route.path}`);
      }
    }

    return next.handle();
  }
}
Injectable()(SentryTracingInterceptor);
export { SentryTracingInterceptor };

/**
 * Global filter to handle exceptions and report them to Sentry.
 */
class SentryGlobalFilter extends BaseExceptionFilter {
  public readonly __SENTRY_INTERNAL__: boolean;

  public constructor(applicationRef?: HttpServer) {
    super(applicationRef);
    this.__SENTRY_INTERNAL__ = true;
  }

  /**
   * Catches exceptions and reports them to Sentry unless they are expected errors.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    if (isExpectedError(exception)) {
      return super.catch(exception, host);
    }

    captureException(exception);
    return super.catch(exception, host);
  }
}
Catch()(SentryGlobalFilter);
export { SentryGlobalFilter };

/**
 * Global filter to handle exceptions and report them to Sentry.
 *
 * The BaseExceptionFilter does not work well in GraphQL applications.
 * By default, Nest GraphQL applications use the ExternalExceptionFilter, which just rethrows the error:
 * https://github.com/nestjs/nest/blob/master/packages/core/exceptions/external-exception-filter.ts
 *
 * The ExternalExceptinFilter is not exported, so we reimplement this filter here.
 */
class SentryGlobalGraphQLFilter {
  private static readonly _logger = new Logger('ExceptionsHandler');
  public readonly __SENTRY_INTERNAL__: boolean;

  public constructor() {
    this.__SENTRY_INTERNAL__ = true;
  }

  /**
   * Catches exceptions and reports them to Sentry unless they are HttpExceptions.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public catch(exception: unknown, host: ArgumentsHost): void {
    // neither report nor log HttpExceptions
    if (exception instanceof HttpException) {
      throw exception;
    }
    if (exception instanceof Error) {
      SentryGlobalGraphQLFilter._logger.error(exception.message, exception.stack);
    }
    captureException(exception);
    throw exception;
  }
}
Catch()(SentryGlobalGraphQLFilter);
export { SentryGlobalGraphQLFilter };

/**
 * Global filter to handle exceptions and report them to Sentry.
 *
 * This filter is a generic filter that can handle both HTTP and GraphQL exceptions.
 */
class SentryGlobalGenericFilter extends SentryGlobalFilter {
  public readonly __SENTRY_INTERNAL__: boolean;
  private readonly _graphqlFilter: SentryGlobalGraphQLFilter;

  public constructor(applicationRef?: HttpServer) {
    super(applicationRef);
    this.__SENTRY_INTERNAL__ = true;
    this._graphqlFilter = new SentryGlobalGraphQLFilter();
  }

  /**
   * Catches exceptions and forwards them to the according error filter.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType<'graphql'>() === 'graphql') {
      return this._graphqlFilter.catch(exception, host);
    }

    super.catch(exception, host);
  }
}
Catch()(SentryGlobalGenericFilter);
export { SentryGlobalGenericFilter };

/**
 * Service to set up Sentry performance tracing for Nest.js applications.
 */
class SentryService implements OnModuleInit {
  public readonly __SENTRY_INTERNAL__: boolean;

  public constructor() {
    this.__SENTRY_INTERNAL__ = true;
  }

  /**
   * Initializes the Sentry service and registers span attributes.
   */
  public onModuleInit(): void {
    // Sadly, NestInstrumentation has no requestHook, so we need to add the attributes here
    // We register this hook in this method, because if we register it in the integration `setup`,
    // it would always run even for users that are not even using Nest.js
    const client = getClient();
    if (client) {
      client.on('spanStart', span => {
        addNestSpanAttributes(span);
      });
    }
  }
}
Injectable()(SentryService);
export { SentryService };

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
        SentryService,

        {
          provide: APP_INTERCEPTOR,
          useClass: SentryTracingInterceptor,
        },
      ],
      exports: [SentryService],
    };
  }
}
Global()(SentryModule);
Module({
  providers: [
    SentryService,

    {
      provide: APP_INTERCEPTOR,
      useClass: SentryTracingInterceptor,
    },
  ],
  exports: [SentryService],
})(SentryModule);
export { SentryModule };

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
