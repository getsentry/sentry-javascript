import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { eventContextExtractor } from '../utils';

interface AwsLambdaOptions {
  /**
   * Disables the AWS context propagation and instead uses
   * Sentry's context. Defaults to `true`, in order for
   * Sentry trace propagation to take precedence, but can
   * be disabled if you want AWS propagation to take take
   * precedence.
   */
  disableAwsContextPropagation?: boolean;
}

export const instrumentAwsLambda = generateInstrumentOnce<AwsLambdaOptions>(
  'AwsLambda',
  (_options: AwsLambdaOptions = {}) => {
    const options = {
      disableAwsContextPropagation: true,
      ..._options,
    };

    return new AwsLambdaInstrumentation({
      ...options,
      eventContextExtractor,
      requestHook(span) {
        span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.otel.aws-lambda');
        span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'function.aws.lambda');
      },
    });
  },
);

const _awsLambdaIntegration = ((options: AwsLambdaOptions = {}) => {
  return {
    name: 'AwsLambda',
    setupOnce() {
      instrumentAwsLambda(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrumentation for aws-sdk package
 */
export const awsLambdaIntegration = defineIntegration(_awsLambdaIntegration);
