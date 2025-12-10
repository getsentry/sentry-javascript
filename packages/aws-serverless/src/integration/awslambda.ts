import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { captureException, generateInstrumentOnce } from '@sentry/node';
import { eventContextExtractor, markEventUnhandled } from '../utils';
import { AwsLambdaInstrumentation } from './instrumentation-aws-lambda/instrumentation';

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

export const instrumentAwsLambda = generateInstrumentOnce(
  'AwsLambda',
  AwsLambdaInstrumentation,
  (options: AwsLambdaOptions) => {
    return {
      disableAwsContextPropagation: true,
      ...options,
      eventContextExtractor,
      requestHook(span) {
        span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.otel.aws_lambda');
        span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'function.aws.lambda');
      },
      responseHook(_span, { err }) {
        if (err) {
          captureException(err, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.otel'));
        }
      },
    };
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
