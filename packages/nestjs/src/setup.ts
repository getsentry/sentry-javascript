import type {
  ArgumentsHost,
  CallHandler,
  DynamicModule,
  ExecutionContext,
  NestInterceptor,
  OnModuleInit,
} from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, BaseExceptionFilter } from '@nestjs/core';
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

/**
 * Note: We cannot use @ syntax to add the decorators, so we add them directly below the classes as function wrappers.
 */

/**
 * Interceptor to add Sentry tracing capabilities to Nest.js applications.
 */
class SentryTracingInterceptor implements NestInterceptor {
  public static readonly __SENTRY_INTERNAL__ = true;

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
  /**
   * Catches exceptions and reports them to Sentry unless they are expected errors.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    // don't report expected errors
    if (exception instanceof HttpException) {
      return super.catch(exception, host);
    }

    captureException(exception);
    return super.catch(exception, host);
  }
}
Catch()(SentryGlobalFilter);
export { SentryGlobalFilter };

/**
 * Service to set up Sentry performance tracing for Nest.js applications.
 */
class SentryService implements OnModuleInit {
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
          provide: APP_FILTER,
          useClass: SentryGlobalFilter,
        },
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
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
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
