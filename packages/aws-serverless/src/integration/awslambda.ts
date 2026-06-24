import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, getCurrentScope, safeSetSpanJSONAttributes } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { AwsLambdaInstrumentation } from './instrumentation-aws-lambda/instrumentation';

interface AwsLambdaOptions {
  /**
   * @deprecated This option no longer does anything and will be removed in a future major version.
   * Sentry trace propagation always takes precedence.
   */
  disableAwsContextPropagation?: boolean;
}

export const instrumentAwsLambda = generateInstrumentOnce('AwsLambda', AwsLambdaInstrumentation, () => {
  return {};
});

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
