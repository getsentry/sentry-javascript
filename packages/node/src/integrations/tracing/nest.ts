import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { captureException, defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

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
export function setupNestErrorHandler(app: {
  useGlobalFilters: (arg0: { catch(exception: unknown): void }) => void;
}): void {
  app.useGlobalFilters(SentryNestExceptionFilter);
}
