import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/core';
import { addOpenTelemetryInstrumentation } from '@sentry/node';

const _awsIntegration = (() => {
  return {
    name: 'Aws',
    setupOnce() {
      addOpenTelemetryInstrumentation(
        new AwsInstrumentation({
          preRequestHook(span) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.otel.aws');
          },
        }),
      );
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrumentation for aws-sdk package
 */
export const awsIntegration = defineIntegration(_awsIntegration);
