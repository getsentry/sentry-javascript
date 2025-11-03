import type { Scope } from '@sentry/core';
import { consoleSandbox, debug } from '@sentry/core';
import { captureException, captureMessage, flush, getCurrentScope, withScope } from '@sentry/node';
import type { Context, Handler, StreamifyHandler } from 'aws-lambda';
import { performance } from 'perf_hooks';
import { types } from 'util';
import { DEBUG_BUILD } from './debug-build';
import { markEventUnhandled } from './utils';

const { isPromise } = types;

// https://www.npmjs.com/package/aws-lambda-consumer
type SyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
  callback: Parameters<T>[2],
) => void;

export type AsyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
) => Promise<NonNullable<Parameters<Parameters<T>[2]>[1]>>;

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

/** */
function isPromiseAllSettledResult<T>(result: T[]): boolean {
  return result.every(
    v =>
      Object.prototype.hasOwnProperty.call(v, 'status') &&
      (Object.prototype.hasOwnProperty.call(v, 'value') || Object.prototype.hasOwnProperty.call(v, 'reason')),
  );
}

type PromiseSettledResult<T> = { status: 'rejected' | 'fulfilled'; reason?: T };

/** */
function getRejectedReasons<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.reduce((rejected: T[], result) => {
    if (result.status === 'rejected' && result.reason) rejected.push(result.reason);
    return rejected;
  }, []);
}

/**
 * TODO(v11): Remove this function
 * @deprecated This function is no longer used and will be removed in a future major version.
 */
export function tryPatchHandler(_taskRoot: string, _handlerPath: string): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('The `tryPatchHandler` function is deprecated and will be removed in a future major version.');
  });
}

/**
 * Tries to invoke context.getRemainingTimeInMillis if not available returns 0
 * Some environments use AWS lambda but don't support this function
 * @param context
 */
function tryGetRemainingTimeInMillis(context: Context): number {
  return typeof context.getRemainingTimeInMillis === 'function' ? context.getRemainingTimeInMillis() : 0;
}

/**
 * Adds additional information from the environment and AWS Context to the Sentry Scope.
 *
 * @param scope Scope that should be enhanced
 * @param context AWS Lambda context that will be used to extract some part of the data
 * @param startTime performance.now() when wrapHandler was invoked
 */
function enhanceScopeWithEnvironmentData(scope: Scope, context: Context, startTime: number): void {
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

function setupTimeoutWarning(context: Context, options: WrapperOptions): NodeJS.Timeout | undefined {
  // In seconds. You cannot go any more granular than this in AWS Lambda.
  const configuredTimeout = Math.ceil(tryGetRemainingTimeInMillis(context) / 1000);
  const configuredTimeoutMinutes = Math.floor(configuredTimeout / 60);
  const configuredTimeoutSeconds = configuredTimeout % 60;

  const humanReadableTimeout =
    configuredTimeoutMinutes > 0
      ? `${configuredTimeoutMinutes}m${configuredTimeoutSeconds}s`
      : `${configuredTimeoutSeconds}s`;

  if (options.captureTimeoutWarning) {
    const timeoutWarningDelay = tryGetRemainingTimeInMillis(context) - options.timeoutWarningLimit;

    return setTimeout(() => {
      withScope(scope => {
        scope.setTag('timeout', humanReadableTimeout);
        captureMessage(`Possible function timeout: ${context.functionName}`, 'warning');
      });
    }, timeoutWarningDelay) as unknown as NodeJS.Timeout;
  }

  return undefined;
}

export const AWS_HANDLER_HIGHWATERMARK_SYMBOL = Symbol.for('aws.lambda.runtime.handler.streaming.highWaterMark');
export const AWS_HANDLER_STREAMING_SYMBOL = Symbol.for('aws.lambda.runtime.handler.streaming');
export const AWS_HANDLER_STREAMING_RESPONSE = 'response';

function isStreamingHandler(handler: Handler | StreamifyHandler): handler is StreamifyHandler {
  return (
    (handler as unknown as Record<symbol, unknown>)[AWS_HANDLER_STREAMING_SYMBOL] === AWS_HANDLER_STREAMING_RESPONSE
  );
}

export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  wrapOptions?: Partial<WrapperOptions>,
): Handler<TEvent, TResult>;

export function wrapHandler<TEvent, TResult>(
  handler: StreamifyHandler<TEvent, TResult>,
  wrapOptions?: Partial<WrapperOptions>,
): StreamifyHandler<TEvent, TResult>;

/**
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param options Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult>,
  wrapOptions: Partial<WrapperOptions> = {},
): Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult> {
  const START_TIME = performance.now();

  // eslint-disable-next-line deprecation/deprecation
  if (typeof wrapOptions.startTrace !== 'undefined') {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        'The `startTrace` option is deprecated and will be removed in a future major version. If you want to disable tracing, set `SENTRY_TRACES_SAMPLE_RATE` to `0.0`.',
      );
    });
  }

  const options: WrapperOptions = {
    flushTimeout: 2000,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    captureAllSettledReasons: false,
    startTrace: true, // TODO(v11): Remove this option. Set to true here to satisfy the type, but has no effect.
    ...wrapOptions,
  };

  if (isStreamingHandler(handler)) {
    return wrapStreamingHandler(handler, options, START_TIME);
  }

  let timeoutWarningTimer: NodeJS.Timeout | undefined;

  // AWSLambda is like Express. It makes a distinction about handlers based on its last argument
  // async (event) => async handler
  // async (event, context) => async handler
  // (event, context, callback) => sync handler
  // Nevertheless whatever option is chosen by user, we convert it to async handler.
  const asyncHandler: AsyncHandler<Handler<TEvent, TResult>> =
    handler.length > 2
      ? (event, context) =>
          new Promise((resolve, reject) => {
            const rv = (handler as SyncHandler<Handler<TEvent, TResult>>)(event, context, (error, result) => {
              if (error === null || error === undefined) {
                resolve(result!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
              } else {
                reject(error);
              }
            }) as unknown;

            // This should never happen, but still can if someone writes a handler as
            // `async (event, context, callback) => {}`
            if (isPromise(rv)) {
              void (rv as Promise<NonNullable<TResult>>).then(resolve, reject);
            }
          })
      : (handler as AsyncHandler<Handler<TEvent, TResult>>);

  return async (event: TEvent, context: Context) => {
    context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

    timeoutWarningTimer = setupTimeoutWarning(context, options);

    async function processResult(): Promise<TResult> {
      const scope = getCurrentScope();

      let rv: TResult;
      try {
        enhanceScopeWithEnvironmentData(scope, context, START_TIME);

        rv = await asyncHandler(event, context);

        // We manage lambdas that use Promise.allSettled by capturing the errors of failed promises
        if (options.captureAllSettledReasons && Array.isArray(rv) && isPromiseAllSettledResult(rv)) {
          const reasons = getRejectedReasons(rv);
          reasons.forEach(exception => {
            captureException(exception, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.promise'));
          });
        }
      } catch (e) {
        // Errors should already captured in the instrumentation's `responseHook`,
        // we capture them here just to be safe. Double captures are deduplicated by the SDK.
        captureException(e, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.handler'));
        throw e;
      } finally {
        clearTimeout(timeoutWarningTimer);
        await flush(options.flushTimeout).catch(e => {
          DEBUG_BUILD && debug.error(e);
        });
      }
      return rv;
    }

    return withScope(async () => {
      return processResult();
    });
  };
}

function wrapStreamingHandler<TEvent, TResult>(
  handler: StreamifyHandler<TEvent, TResult>,
  options: WrapperOptions,
  startTime: number,
): StreamifyHandler<TEvent, TResult> {
  let timeoutWarningTimer: NodeJS.Timeout | undefined;

  const wrappedHandler = async (
    event: TEvent,
    responseStream: Parameters<StreamifyHandler<TEvent, TResult>>[1],
    context: Context,
  ): Promise<TResult> => {
    context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

    timeoutWarningTimer = setupTimeoutWarning(context, options);

    async function processStreamingResult(): Promise<TResult> {
      const scope = getCurrentScope();

      try {
        enhanceScopeWithEnvironmentData(scope, context, startTime);

        responseStream.on('error', error => {
          captureException(error, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.stream'));
        });

        return await handler(event, responseStream, context);
      } catch (e) {
        // Errors should already captured in the instrumentation's `responseHook`,
        // we capture them here just to be safe. Double captures are deduplicated by the SDK.
        captureException(e, scope => markEventUnhandled(scope, 'auto.function.aws_serverless.handler'));
        throw e;
      } finally {
        if (timeoutWarningTimer) {
          clearTimeout(timeoutWarningTimer);
        }
        await flush(options.flushTimeout).catch(e => {
          DEBUG_BUILD && debug.error(e);
        });
      }
    }

    return withScope(() => processStreamingResult());
  };

  const handlerWithSymbols = handler as unknown as Record<symbol, unknown>;
  (wrappedHandler as unknown as Record<symbol, unknown>)[AWS_HANDLER_STREAMING_SYMBOL] =
    handlerWithSymbols[AWS_HANDLER_STREAMING_SYMBOL];
  (wrappedHandler as unknown as Record<symbol, unknown>)[AWS_HANDLER_HIGHWATERMARK_SYMBOL] =
    handlerWithSymbols[AWS_HANDLER_HIGHWATERMARK_SYMBOL];

  return wrappedHandler;
}
