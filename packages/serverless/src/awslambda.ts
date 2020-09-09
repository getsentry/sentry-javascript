import { captureException, captureMessage, flush, Scope, SDK_VERSION, Severity, withScope } from '@sentry/node';
import { addExceptionMechanism } from '@sentry/utils';
import { Callback, Context, Handler } from 'aws-lambda';
import { hostname } from 'os';
import { performance } from 'perf_hooks';
import { types } from 'util';

const { isPromise } = types;

interface WrapperOptions {
  flushTimeout: number;
  rethrowAfterCapture: boolean;
  callbackWaitsForEmptyEventLoop: boolean;
  captureTimeoutWarning: boolean;
  timeoutWarning: number;
}

/**
 * Add event processor that will override SDK details to point to the serverless SDK instead of Node,
 * as well as set correct mechanism type, which should be set to `handled: false`.
 * We do it like this, so that we don't introduce any side-effects in this module, which makes it tree-shakeable.
 * @param scope Scope that processor should be added to
 */
function addServerlessEventProcessor(scope: Scope): void {
  scope.addEventProcessor(event => {
    event.sdk = {
      ...event.sdk,
      name: 'sentry.javascript.serverless',
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/serverless',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    addExceptionMechanism(event, {
      handled: false,
    });

    return event;
  });
}

/**
 * Adds additional information from the environment and AWS Context to the Sentry Scope.
 *
 * @param scope Scope that should be enhanced
 * @param context AWS Lambda context that will be used to extract some part of the data
 */
function enhanceScopeWithEnvironmentData(scope: Scope, context: Context): void {
  scope.setTransactionName(context.functionName);

  scope.setTag('server_name', process.env._AWS_XRAY_DAEMON_ADDRESS || process.env.SENTRY_NAME || hostname());
  scope.setTag('url', `awslambda:///${context.functionName}`);

  scope.setContext('runtime', {
    name: 'node',
    version: global.process.version,
  });

  scope.setContext('aws.lambda', {
    aws_request_id: context.awsRequestId,
    function_name: context.functionName,
    function_version: context.functionVersion,
    invoked_function_arn: context.invokedFunctionArn,
    execution_duration_in_millis: performance.now(),
    remaining_time_in_millis: context.getRemainingTimeInMillis(),
    'sys.argv': process.argv,
  });

  scope.setContext('aws.cloudwatch.logs', {
    log_group: context.logGroupName,
    log_stream: context.logStreamName,
    url: `https://console.aws.amazon.com/cloudwatch/home?region=${
      process.env.AWS_REGION
    }#logsV2:log-groups/log-group/${encodeURIComponent(context.logGroupName)}/log-events/${encodeURIComponent(
      context.logStreamName,
    )}`,
  });
}

/**
 * Capture, flush the result down the network stream and await the response.
 *
 * @param e exception to be captured
 * @param options WrapperOptions
 */
function captureExceptionAsync(e: any, context: Context, options: Partial<WrapperOptions>): Promise<void> {
  withScope(scope => {
    addServerlessEventProcessor(scope);
    enhanceScopeWithEnvironmentData(scope, context);
    captureException(e);
  });

  return flush(options.flushTimeout).then(() => {
    if (options.rethrowAfterCapture) {
      throw e;
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const wrapHandler = <TEvent = any, TResult = any>(
  handler: Handler,
  options: Partial<WrapperOptions> = {},
): Handler => {
  const opts = {
    flushTimeout: 2000,
    rethrowAfterCapture: true,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    ...options,
  };
  let timeoutWarningTimer: NodeJS.Timeout;

  return (event: TEvent, context: Context, callback: Callback<TResult>) => {
    context.callbackWaitsForEmptyEventLoop = opts.callbackWaitsForEmptyEventLoop;

    // In seconds. You cannot go any more granular than this in AWS Lambda.
    const configuredTimeout = Math.ceil(context.getRemainingTimeInMillis() / 1000);
    const configuredTimeoutMinutes = Math.floor(configuredTimeout / 60);
    const configuredTimeoutSeconds = configuredTimeout % 60;

    const humanReadableTimeout =
      configuredTimeoutMinutes > 0
        ? `${configuredTimeoutMinutes}m${configuredTimeoutSeconds}s`
        : `${configuredTimeoutSeconds}s`;

    // When `callbackWaitsForEmptyEventLoop` is set to false, which it should when using `captureTimeoutWarning`,
    // we don't have a guarantee that this message will be delivered. Because of that, we don't flush it.
    if (opts.captureTimeoutWarning) {
      const timeoutWarningDelay = context.getRemainingTimeInMillis() - opts.timeoutWarningLimit;

      timeoutWarningTimer = setTimeout(() => {
        withScope(scope => {
          addServerlessEventProcessor(scope);
          enhanceScopeWithEnvironmentData(scope, context);
          scope.setTag('timeout', humanReadableTimeout);
          captureMessage(`Possible function timeout: ${context.functionName}`, Severity.Warning);
        });
      }, timeoutWarningDelay);
    }

    try {
      const callbackWrapper: Callback<TResult> = (...args) => {
        clearTimeout(timeoutWarningTimer);
        return callback(...args);
      };
      let handlerRv = handler(event, context, callbackWrapper);

      if (isPromise(handlerRv)) {
        handlerRv = handlerRv as Promise<TResult>;
        return handlerRv.catch(e => {
          clearTimeout(timeoutWarningTimer);
          return captureExceptionAsync(e, context, opts);
        });
      } else {
        return handlerRv;
      }
    } catch (e) {
      clearTimeout(timeoutWarningTimer);
      return captureExceptionAsync(e, context, opts);
    }
  };
};
