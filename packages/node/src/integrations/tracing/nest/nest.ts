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
import type { Span } from '@sentry/types';
import { consoleSandbox, logger } from '@sentry/utils';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryNestEventInstrumentation } from './sentry-nest-event-instrumentation';
import { SentryNestInstrumentation } from './sentry-nest-instrumentation';
import type { MinimalNestJsApp, NestJsErrorFilter } from './types';

const INTEGRATION_NAME = 'Nest';

const instrumentNestCore = generateInstrumentOnce('Nest-Core', () => {
  return new NestInstrumentation();
});

const instrumentNestCommon = generateInstrumentOnce('Nest-Common', () => {
  return new SentryNestInstrumentation();
});

const instrumentNestEvent = generateInstrumentOnce('Nest-Event', () => {
  return new SentryNestEventInstrumentation();
});

export const instrumentNest = Object.assign(
  (): void => {
    instrumentNestCore();
    instrumentNestCommon();
    instrumentNestEvent();
  },
  { id: INTEGRATION_NAME },
);

/**
 * Integration capturing tracing data for NestJS.
 *
 * @deprecated The `nestIntegration` is deprecated. Instead, use the NestJS SDK directly (`@sentry/nestjs`), or use the `nestIntegration` export from `@sentry/nestjs`.
 */
export const nestIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentNest();
    },
  };
});

/**
 * Setup an error handler for Nest.
 *
 * @deprecated `setupNestErrorHandler` is deprecated.
 * Instead use the `@sentry/nestjs` package, which has more functional APIs for capturing errors.
 * See the [`@sentry/nestjs` Setup Guide](https://docs.sentry.io/platforms/javascript/guides/nestjs/) for how to set up the Sentry NestJS SDK.
 */
export function setupNestErrorHandler(app: MinimalNestJsApp, baseFilter: NestJsErrorFilter): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      '[Sentry] Warning: You used the `setupNestErrorHandler()` method to set up Sentry error monitoring. This function is deprecated and will be removed in the next major version. Instead, it is recommended to use the `@sentry/nestjs` package. To set up the NestJS SDK see: https://docs.sentry.io/platforms/javascript/guides/nestjs/',
    );
  });

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
          const exceptionIsObject = typeof exception === 'object' && exception !== null;
          const exceptionStatusCode = exceptionIsObject && 'status' in exception ? exception.status : null;
          const exceptionErrorProperty = exceptionIsObject && 'error' in exception ? exception.error : null;

          /*
          Don't report expected NestJS control flow errors
          - `HttpException` errors will have a `status` property
          - `RpcException` errors will have an `error` property
           */
          if (exceptionStatusCode !== null || exceptionErrorProperty !== null) {
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
