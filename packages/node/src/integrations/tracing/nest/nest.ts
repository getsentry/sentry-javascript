import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  defineIntegration,
  getClient,
  getDefaultIsolationScope,
  getIsolationScope,
  spanToJSON,
} from '@sentry/core';
import type { IntegrationFn, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { SentryNestErrorInstrumentation } from './sentry-nest-error-instrumentation';
import { SentryNestInstrumentation } from './sentry-nest-instrumentation';
import type { MinimalNestJsApp, NestJsErrorFilter } from './types';

const INTEGRATION_NAME = 'Nest';

const instrumentNestCore = generateInstrumentOnce('Nest-Core', () => {
  return new NestInstrumentation();
});

const instrumentNestCommon = generateInstrumentOnce('Nest-Common', () => {
  return new SentryNestInstrumentation();
});

const instrumentNestErrors = generateInstrumentOnce('Nest-Errors', () => {
  return new SentryNestErrorInstrumentation();
});

export const instrumentNest = Object.assign(
  (): void => {
    instrumentNestCore();
    instrumentNestCommon();
    instrumentNestErrors();
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
 * Set span attributes for the nest instrumentation.
 *
 * Previously this method was used to setup an error handler reporting to Sentry, but this is no longer the case.
 * This method should be renamed in the next major.
 */
export function setupNestErrorHandler(
  app: MinimalNestJsApp,
  baseFilter: NestJsErrorFilter | undefined = undefined,
): void {
  if (baseFilter) {
    // No need to pass a base filter to setup the error handler anymore, since we always patch the `BaseExceptionFilter`.
    logger.warn('baseFilter is deprecated and no longer needed.');
  }

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
