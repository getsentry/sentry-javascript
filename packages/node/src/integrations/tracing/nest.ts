import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { captureException, defineIntegration, getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';

interface MinimalNestJsExecutionContext {
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
interface MinimalNestJsApp {
  useGlobalFilters: (arg0: { catch(exception: unknown): void }) => void;
  useGlobalInterceptors: (interceptor: {
    intercept: (context: MinimalNestJsExecutionContext, next: { handle: () => void }) => void;
  }) => void;
}

const _nestIntegration = (() => {
  return {
    name: 'Nest',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new NestInstrumentation({})],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Nest framework integration
 *
 * Capture tracing data for nest.
 */
export const nestIntegration = defineIntegration(_nestIntegration);

const SentryNestExceptionFilter = {
  catch(exception: unknown) {
    captureException(exception);
  },
};

/**
 * Setup an error handler for Nest.
 */
export function setupNestErrorHandler(app: MinimalNestJsApp): void {
  app.useGlobalInterceptors({
    intercept(context, next) {
      if (getIsolationScope() === getDefaultIsolationScope()) {
        logger.warn('Isolation scope is still the default isolation scope, skipping setting transactionName.');
        return next.handle();
      }

      const req = context.switchToHttp().getRequest();
      if (req.route) {
        getIsolationScope().setTransactionName(`${req.method?.toUpperCase() || 'GET'} ${req.route.path}`);
      }
      return next.handle();
    },
  });

  app.useGlobalFilters(SentryNestExceptionFilter);
}
