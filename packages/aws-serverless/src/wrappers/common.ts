import type { Scope } from '@sentry/core';
import { captureMessage, withScope } from '@sentry/node';
import type { Context } from 'aws-lambda';

export interface WrapperOptions {
  flushTimeout: number;
  callbackWaitsForEmptyEventLoop: boolean;
  captureTimeoutWarning: boolean;
  timeoutWarningLimit: number;
  /**
   * Capture all errors when `Promise.allSettled` is returned by the handler
   * The {@link wrapHandler} will not fail the lambda even if there are errors
   * @default false
   */
  captureAllSettledReasons: boolean;
  // TODO(v11): Remove this option since its no longer used.
  /**
   * @deprecated This option has no effect and will be removed in a future major version.
   * If you want to disable tracing, set `SENTRY_TRACES_SAMPLE_RATE` to `0.0`, otherwise OpenTelemetry will automatically trace the handler.
   */
  startTrace: boolean;
}

export const AWS_HANDLER_HIGHWATERMARK = Symbol.for('aws.lambda.runtime.handler.highWaterMark');
export const AWS_HANDLER_STREAMING = Symbol.for('aws.lambda.runtime.handler.streaming');
export const AWS_STREAM_RESPONSE = 'response';

/**
 *
 */
export function createDefaultWrapperOptions(wrapOptions: Partial<WrapperOptions> = {}): WrapperOptions {
  return {
    flushTimeout: 2000,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    captureAllSettledReasons: false,
    startTrace: true, // TODO(v11): Remove this option. Set to true here to satisfy the type, but has no effect.
    ...wrapOptions,
  };
}

/**
 *
 */
export function setupTimeoutWarning(context: Context, options: WrapperOptions): NodeJS.Timeout | undefined {
  if (!options.captureTimeoutWarning) {
    return undefined;
  }

  const timeoutWarningDelay = tryGetRemainingTimeInMillis(context) - options.timeoutWarningLimit;
  const humanReadableTimeout = getHumanReadableTimeout(context);

  return setTimeout(() => {
    withScope(scope => {
      scope.setTag('timeout', humanReadableTimeout);
      captureMessage(`Possible function timeout: ${context.functionName}`, 'warning');
    });
  }, timeoutWarningDelay) as unknown as NodeJS.Timeout;
}

/**
 * Adds additional information from the environment and AWS Context to the Sentry Scope.
 *
 * @param scope Scope that should be enhanced
 * @param context AWS Lambda context that will be used to extract some part of the data
 * @param startTime performance.now() when wrapHandler was invoked
 */
export function enhanceScopeWithEnvironmentData(scope: Scope, context: Context, startTime: number): void {
  scope.setContext('aws.lambda', {
    aws_request_id: context.awsRequestId,
    function_name: context.functionName,
    function_version: context.functionVersion,
    invoked_function_arn: context.invokedFunctionArn,
    execution_duration_in_millis: performance.now() - startTime,
    remaining_time_in_millis: tryGetRemainingTimeInMillis(context),
    'sys.argv': process.argv,
  });

  scope.setContext('aws.cloudwatch.logs', {
    log_group: context.logGroupName,
    log_stream: context.logStreamName,
    url: `https://console.aws.amazon.com/cloudwatch/home?region=${
      process.env.AWS_REGION
    }#logsV2:log-groups/log-group/${encodeURIComponent(context.logGroupName)}/log-events/${encodeURIComponent(
      context.logStreamName,
    )}?filterPattern="${context.awsRequestId}"`,
  });
}

/**
 *
 */
export function getHumanReadableTimeout(context: Context): string {
  const configuredTimeout = Math.ceil(tryGetRemainingTimeInMillis(context) / 1000);
  const configuredTimeoutMinutes = Math.floor(configuredTimeout / 60);
  const configuredTimeoutSeconds = configuredTimeout % 60;

  return configuredTimeoutMinutes > 0
    ? `${configuredTimeoutMinutes}m${configuredTimeoutSeconds}s`
    : `${configuredTimeoutSeconds}s`;
}

/**
 * Tries to invoke context.getRemainingTimeInMillis if not available returns 0
 * Some environments use AWS lambda but don't support this function
 * @param context
 */
function tryGetRemainingTimeInMillis(context: Context): number {
  return typeof context.getRemainingTimeInMillis === 'function' ? context.getRemainingTimeInMillis() : 0;
}
