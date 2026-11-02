import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, getCurrentScope, safeSetSpanJSONAttributes } from '@sentry/core';
import { _INTERNAL_redirectLambdaHandler } from '@sentry/node';
import { createRequire } from 'node:module';
import { DEBUG_BUILD } from '../debug-build';

const SHIM_MODULE_ID = '@sentry/aws-serverless/run-lambda-handler';

function resolveShimFile(): string | undefined {
  try {
    // In the CJS build `require` exists; in the ESM build (and when running the TS source
    // directly, e.g. in tests) we create one. Rollup converts `import.meta.url` to an
    // equivalent for the CJS build, so both branches are always syntactically valid.
    const resolve = typeof require === 'function' ? require.resolve : createRequire(import.meta.url).resolve;
    return resolve(SHIM_MODULE_ID);
  } catch (error) {
    DEBUG_BUILD && debug.warn(`Could not resolve ${SHIM_MODULE_ID}, not instrumenting the Lambda handler.`, error);
    return undefined;
  }
}

/**
 * Redirects the Lambda runtime to the Sentry handler shim (`run-lambda-handler.mjs`), which wraps the user's handler
 * with the full Lambda instrumentation. See `_INTERNAL_redirectLambdaHandler` in `@sentry/node`.
 */
export function redirectLambdaHandler(): void {
  _INTERNAL_redirectLambdaHandler(resolveShimFile);
}

const AWS_LAMBDA_CONTEXT_FIELDS = [
  'aws_request_id',
  'function_name',
  'function_version',
  'invoked_function_arn',
  'execution_duration_in_millis',
  'remaining_time_in_millis',
] as const;

const AWS_CLOUDWATCH_CONTEXT_FIELDS = ['log_group', 'log_stream', 'url'] as const;

const _awsLambdaIntegration = (() => {
  return {
    name: 'AwsLambda' as const,
    setupOnce() {
      redirectLambdaHandler();
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
 * Instrumentation for the AWS Lambda handler.
 */
export const awsLambdaIntegration = defineIntegration(_awsLambdaIntegration);
