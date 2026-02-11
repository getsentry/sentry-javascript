import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';

/**
 * Instrumentation for aws-sdk package
 */
export const awsIntegration = defineIntegration(() => {
  return {
    name: 'Aws',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new AwsInstrumentation({
            preRequestHook(span) {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.otel.aws');
            },
          }),
        ],
      });
    },
  };
});
