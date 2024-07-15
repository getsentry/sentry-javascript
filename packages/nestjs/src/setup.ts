import { Logger } from '@nestjs/common';
import type { DynamicModule, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import {BaseExceptionFilter} from '@nestjs/core';
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

  get: <T>(type: new (...args: any[]) => T) => T;
}

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
 * Set up a nest service that provides error handling and performance tracing.
 */
export class SentryIntegrationService implements OnModuleInit {
  // eslint-disable-next-line @sentry-internal/sdk/no-class-field-initializers
  private readonly _logger = new Logger(SentryIntegrationService.name);

  public constructor(
    private readonly _moduleRef: ModuleRef
  ) {}

  /**
   * Called when the SentryModuleIntegration gets initialized.
   */
  public onModuleInit(): void {
    const app: MinimalNestJsApp = this._moduleRef.get('NestApplication');
    const baseFilter: NestJsErrorFilter = new BaseExceptionFilter();

    if (!app) {
      this._logger.warn('Failed to retrieve the application instance.');
      return;
    }

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
            // eslint-disable-next-line @sentry-internal/sdk/no-optional-chaining
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
      providers: [SentryIntegrationService],
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

  span.setAttributes({
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.otel.nestjs',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `${type}.nestjs`,
  });
}

Injectable()(SentryIntegrationService);
Global()(SentryIntegrationModule);
Module({
  providers: [SentryIntegrationService],
  exports: [SentryIntegrationService],
})(SentryIntegrationModule);
