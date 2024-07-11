import type { ArgumentsHost } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
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

interface ExceptionFilterInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch: (exception: unknown, host: ArgumentsHost) => any;
}

interface Provider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metatype: any;
  instance: ExceptionFilterInstance;
}

const INTEGRATION_NAME = 'Nest';
const CATCH_WATERMARK = '__catch__';

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
 * Setup an error handler for Nest.
 */
export function setupNestErrorHandler(app: MinimalNestJsApp): void {
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
          // eslint-disable-next-line @sentry-internal/sdk/no-optional-chaining
          getIsolationScope().setTransactionName(`${req.method?.toUpperCase() || 'GET'} ${req.route.path}`);
        }
      }

      return next.handle();
    },
  });

  checkinExceptionFilters(app);
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

function checkinExceptionFilters(app: MinimalNestJsApp): void {
  const discoveryService = app.get(DiscoveryService);
  const providers = discoveryService.getProviders() as Provider[];
  const exceptionFilters = providers.filter(
    ({ metatype }) => metatype && Reflect.getMetadata(CATCH_WATERMARK, metatype),
  );

  exceptionFilters.map(mod => {
    const instance = mod.instance;
    const originalCatch = instance.catch;

    instance.catch = function (exception: unknown, host) {
      const status_code = (exception as { status?: number }).status;

      // don't report expected errors
      if (status_code !== undefined && status_code >= 400 && status_code < 500) {
        return originalCatch.apply(this, [exception, host]);
      }

      captureException(exception);
      return originalCatch.apply(this, [exception, host]);
    };

    return mod;
  });
}
