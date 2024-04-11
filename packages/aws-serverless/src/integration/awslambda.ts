import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

const _awsLambdaIntegration = (() => {
  return {
    name: 'AwsLambda',
    setupOnce() {
      registerInstrumentations({
        instrumentations: [
          new AwsLambdaInstrumentation({
            requestHook(span) {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.otel.aws-lambda');
            },
          }),
        ],
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrumentation for aws-sdk package
 */
export const awsLambdaIntegration = defineIntegration(_awsLambdaIntegration);
