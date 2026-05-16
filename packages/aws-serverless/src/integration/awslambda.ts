import type { IntegrationFn } from '@sentry/core';
import {
  defineIntegration,
  getCurrentScope,
  safeSetSpanJSONAttributes,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
} from '@sentry/core';
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

const AWS_LAMBDA_CONTEXT_FIELDS = [
  'aws_request_id',
  'function_name',
  'function_version',
  'invoked_function_arn',
  'execution_duration_in_millis',
  'remaining_time_in_millis',
] as const;

const AWS_CLOUDWATCH_CONTEXT_FIELDS = ['log_group', 'log_stream', 'url'] as const;

const _awsLambdaIntegration = ((options: AwsLambdaOptions = {}) => {
  return {
    name: 'AwsLambda',
    setupOnce() {
      instrumentAwsLambda(options);
    },
    processSegmentSpan(span) {
      const { contexts } = getCurrentScope().getScopeData();

      const awsLambda = contexts['aws.lambda'];
      if (awsLambda) {
        const attrs: Record<string, unknown> = {};
        for (const field of AWS_LAMBDA_CONTEXT_FIELDS) {
          const value = awsLambda[field];
          if (typeof value === 'string' || typeof value === 'number') {
            attrs[`aws.lambda.${field}`] = value;
          }
        }
        safeSetSpanJSONAttributes(span, attrs);
      }

      const awsCloudwatch = contexts['aws.cloudwatch.logs'];
      if (awsCloudwatch) {
        const attrs: Record<string, unknown> = {};
        for (const field of AWS_CLOUDWATCH_CONTEXT_FIELDS) {
          const value = awsCloudwatch[field];
          if (typeof value === 'string' || typeof value === 'number') {
            attrs[`aws.cloudwatch.logs.${field}`] = value;
          }
        }
        safeSetSpanJSONAttributes(span, attrs);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrumentation for aws-sdk package
 */
export const awsLambdaIntegration = defineIntegration(_awsLambdaIntegration);
