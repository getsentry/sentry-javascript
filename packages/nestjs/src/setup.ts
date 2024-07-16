import type {
  ArgumentsHost,
  CallHandler,
  DynamicModule,
  ExecutionContext,
  NestInterceptor,
  OnModuleInit,
} from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { APP_FILTER, BaseExceptionFilter } from '@nestjs/core';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  captureException,
  defineIntegration,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import type { IntegrationFn, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import type { Observable } from 'rxjs';

const INTEGRATION_NAME = 'Nest';

export const instrumentNest = generateInstrumentOnce(INTEGRATION_NAME, () => new NestInstrumentation());

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
 *
 */
export class SentryTracingInterceptor implements NestInterceptor {
  /**
   *
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

/**
 *
 */
export class SentryGlobalFilter extends BaseExceptionFilter {
  /**
   *
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const status_code = (exception as { status?: number }).status;

    // don't report expected errors
    if (status_code !== undefined && status_code >= 400 && status_code < 500) {
      return super.catch(exception, host);
    }

    captureException(exception);
    return super.catch(exception, host);
  }
}

/**
 * Set up a nest service that provides error handling and performance tracing.
 */
export class SentryIntegrationService implements OnModuleInit {
  /**
   * Called when the SentryModuleIntegration gets initialized.
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

/**
 * Set up a root module that can be injected in nest applications.
 */
export class SentryIntegrationModule {
  /**
   * Called by the user to set the module as root module in a nest application.
   */
  public static forRoot(): DynamicModule {
    return {
      module: SentryIntegrationModule,
      providers: [
        SentryIntegrationService,
        {
          provide: APP_FILTER,
          useClass: SentryGlobalFilter,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: SentryTracingInterceptor,
        },
      ],
      exports: [SentryIntegrationService],
    };
  }
}

function addNestSpanAttributes(span: Span): void {
  const attributes = spanToJSON(span).data || {};

  // this is one of: app_creation, request_context, handler
  const type = attributes['nestjs.type'];

  // If this is already set, or we have no nest.js span, no need to process again...
  if (attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP] || !type) {
    return;
  }

  console.log('setting span attributes: ')
  console.log(span);

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.nestjs',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.nestjs`,
  });
}

Catch()(SentryGlobalFilter);
Injectable()(SentryTracingInterceptor);
Injectable()(SentryIntegrationService);
Global()(SentryIntegrationModule);
Module({
  providers: [
    SentryIntegrationService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryTracingInterceptor,
    },
  ],
  exports: [SentryIntegrationService],
})(SentryIntegrationModule);
