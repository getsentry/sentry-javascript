import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AwsInstrumentation } from './vendored/aws-sdk';
import { defineIntegration } from '@sentry/core';

/**
 * Instrumentation for aws-sdk package
 */
export const awsIntegration = defineIntegration(() => {
  return {
    name: 'Aws' as const,
    setupOnce() {
      registerInstrumentations({
        instrumentations: [new AwsInstrumentation()],
      });
    },
  };
});
