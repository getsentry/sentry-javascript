import type {
  ArgumentsHost,
  CallHandler,
  DynamicModule,
  ExecutionContext,
  HttpServer,
  NestInterceptor,
  OnModuleInit,
} from '@nestjs/common';
import { Catch, Global, HttpException, Injectable, Logger, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, BaseExceptionFilter } from '@nestjs/core';
import type { Span } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  logger,
  spanToJSON,
} from '@sentry/core';
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
 *
 * @deprecated `SentryTracingInterceptor` is deprecated.
 * If you are using `@sentry/nestjs` you can safely remove any references to the `SentryTracingInterceptor`.
 * If you are using another package migrate to `@sentry/nestjs` and remove the `SentryTracingInterceptor` afterwards.
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
      if ('routeOptions' in req && req.routeOptions && req.routeOptions.url) {
        // fastify case
        getIsolationScope().setTransactionName(`${(req.method || 'GET').toUpperCase()} ${req.routeOptions.url}`);
      } else if ('route' in req && req.route && req.route.path) {
        // express case
        getIsolationScope().setTransactionName(`${(req.method || 'GET').toUpperCase()} ${req.route.path}`);
      }
    }

    return next.handle();
  }
}
// eslint-disable-next-line deprecation/deprecation
Injectable()(SentryTracingInterceptor);
// eslint-disable-next-line deprecation/deprecation
export { SentryTracingInterceptor };

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
 * Global filter to handle exceptions in NestJS + GraphQL applications and report them to Sentry.
 *
 * @deprecated `SentryGlobalGraphQLFilter` is deprecated. Use the `SentryGlobalFilter` instead. The `SentryGlobalFilter` is a drop-in replacement.
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
      // eslint-disable-next-line deprecation/deprecation
      SentryGlobalGraphQLFilter._logger.error(exception.message, exception.stack);
    }
    captureException(exception);
    throw exception;
  }
}
// eslint-disable-next-line deprecation/deprecation
Catch()(SentryGlobalGraphQLFilter);
// eslint-disable-next-line deprecation/deprecation
export { SentryGlobalGraphQLFilter };

/**
 * Global filter to handle exceptions and report them to Sentry.
 *
 * This filter is a generic filter that can handle both HTTP and GraphQL exceptions.
 *
 * @deprecated `SentryGlobalGenericFilter` is deprecated. Use the `SentryGlobalFilter` instead. The `SentryGlobalFilter` is a drop-in replacement.
 */
export const SentryGlobalGenericFilter = SentryGlobalFilter;

/**
 * Service to set up Sentry performance tracing for Nest.js applications.
 *
 * @deprecated `SentryService` is deprecated.
 * If you are using `@sentry/nestjs` you can safely remove any references to the `SentryService`.
 * If you are using another package migrate to `@sentry/nestjs` and remove the `SentryService` afterwards.
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
// eslint-disable-next-line deprecation/deprecation
Injectable()(SentryService);
// eslint-disable-next-line deprecation/deprecation
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
        // eslint-disable-next-line deprecation/deprecation
        SentryService,
        {
          provide: APP_INTERCEPTOR,
          // eslint-disable-next-line deprecation/deprecation
          useClass: SentryTracingInterceptor,
        },
      ],
      // eslint-disable-next-line deprecation/deprecation
      exports: [SentryService],
    };
  }
}
Global()(SentryModule);
Module({
  providers: [
    // eslint-disable-next-line deprecation/deprecation
    SentryService,
    {
      provide: APP_INTERCEPTOR,
      // eslint-disable-next-line deprecation/deprecation
      useClass: SentryTracingInterceptor,
    },
  ],
  // eslint-disable-next-line deprecation/deprecation
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
