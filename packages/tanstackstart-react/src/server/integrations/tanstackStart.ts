import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { SentryTanstackStartInstrumentation } from './sentry-tanstackstart-instrumentation';

const INTEGRATION_NAME = 'TanstackStart';

const instrumentTanstackStartPackage = generateInstrumentOnce(INTEGRATION_NAME, () => {
  return new SentryTanstackStartInstrumentation();
});

export const instrumentTanstackStart = Object.assign(
  (): void => {
    instrumentTanstackStartPackage();
  },
  { id: INTEGRATION_NAME },
);

/**
 * Integration capturing tracing data for @tanstack/react-start.
 */
export const tanstackStartIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentTanstackStart();
    },
  };
});

