import { existsSync } from 'fs';
import { hostname } from 'os';
import { basename, resolve } from 'path';
import { types } from 'util';
import type { Integration, Options, Scope, SdkMetadata, Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, logger } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  SDK_VERSION,
  captureException,
  captureMessage,
  continueTrace,
  flush,
  getCurrentScope,
  getDefaultIntegrationsWithoutPerformance,
  initWithoutDefaultIntegrations,
  startSpanManual,
  withScope,
} from '@sentry/node';
import type { Context, Handler } from 'aws-lambda';
import { performance } from 'perf_hooks';
import { DEBUG_BUILD } from './debug-build';
import { awsIntegration } from './integration/aws';
import { awsLambdaIntegration } from './integration/awslambda';
import { getAwsTraceData, markEventUnhandled } from './utils';

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
  /**
   * Automatically trace all handler invocations.
   * You may want to disable this if you use express within Lambda.
   * @default true
   */
  startTrace: boolean;
}

/**
 * Get the default integrations for the AWSLambda SDK.
 */
// NOTE: in awslambda-auto.ts, we also call the original `getDefaultIntegrations` from `@sentry/node` to load performance integrations.
// If at some point we need to filter a node integration out for good, we need to make sure to also filter it out there.
export function getDefaultIntegrations(_options: Options): Integration[] {
  return [...getDefaultIntegrationsWithoutPerformance(), awsIntegration(), awsLambdaIntegration()];
}

/**
 * Initializes the Sentry AWS Lambda SDK.
 *
 * @param options Configuration options for the SDK, @see {@link AWSLambdaOptions}.
 */
export function init(options: NodeOptions = {}): NodeClient | undefined {
  const opts = {
    _metadata: {} as SdkMetadata,
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  opts._metadata.sdk = opts._metadata.sdk || {
    name: 'sentry.javascript.aws-serverless',
    integrations: ['AWSLambda'],
    packages: [
      {
        name: 'npm:@sentry/aws-serverless',
        version: SDK_VERSION,
      },
    ],
    version: SDK_VERSION,
  };

  return initWithoutDefaultIntegrations(opts);
}

/** */
function tryRequire<T>(taskRoot: string, subdir: string, mod: string): T {
  const lambdaStylePath = resolve(taskRoot, subdir, mod);
  if (existsSync(lambdaStylePath) || existsSync(`${lambdaStylePath}.js`)) {
    // Lambda-style path
    return require(lambdaStylePath);
  }
  // Node-style path
  return require(require.resolve(mod, { paths: [taskRoot, subdir] }));
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

/** */
export function tryPatchHandler(taskRoot: string, handlerPath: string): void {
  type HandlerBag = HandlerModule | Handler | null | undefined;

  interface HandlerModule {
    [key: string]: HandlerBag;
  }

  const handlerDesc = basename(handlerPath);
  const match = handlerDesc.match(/^([^.]*)\.(.*)$/);
  if (!match) {
    DEBUG_BUILD && logger.error(`Bad handler ${handlerDesc}`);
    return;
  }

  const [, handlerMod = '', handlerName = ''] = match;

  let obj: HandlerBag;
  try {
    const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
    obj = tryRequire(taskRoot, handlerDir, handlerMod);
  } catch (e) {
    DEBUG_BUILD && logger.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
    return;
  }

  let mod: HandlerBag;
  let functionName: string | undefined;
  handlerName.split('.').forEach(name => {
    mod = obj;
    obj = obj && (obj as HandlerModule)[name];
    functionName = name;
  });
  if (!obj) {
    DEBUG_BUILD && logger.error(`${handlerPath} is undefined or not exported`);
    return;
  }
  if (typeof obj !== 'function') {
    DEBUG_BUILD && logger.error(`${handlerPath} is not a function`);
    return;
  }

  // Check for prototype pollution
  if (functionName === '__proto__' || functionName === 'constructor' || functionName === 'prototype') {
    DEBUG_BUILD && logger.error(`Invalid handler name: ${functionName}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  (mod as HandlerModule)[functionName!] = wrapHandler(obj);
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

/**
 * Adds additional transaction-related information from the environment and AWS Context to the Sentry Scope.
 *
 * @param scope Scope that should be enhanced
 * @param context AWS Lambda context that will be used to extract some part of the data
 */
function enhanceScopeWithTransactionData(scope: Scope, context: Context): void {
  scope.setTransactionName(context.functionName);
  scope.setTag('server_name', process.env._AWS_XRAY_DAEMON_ADDRESS || process.env.SENTRY_NAME || hostname());
  scope.setTag('url', `awslambda:///${context.functionName}`);
}

/**
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param options Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  wrapOptions: Partial<WrapperOptions> = {},
): Handler<TEvent, TResult> {
  const START_TIME = performance.now();
  const options: WrapperOptions = {
    flushTimeout: 2000,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    captureAllSettledReasons: false,
    startTrace: true,
    ...wrapOptions,
  };
  let timeoutWarningTimer: NodeJS.Timeout;

  // AWSLambda is like Express. It makes a distinction about handlers based on its last argument
  // async (event) => async handler
  // async (event, context) => async handler
  // (event, context, callback) => sync handler
  // Nevertheless whatever option is chosen by user, we convert it to async handler.
  const asyncHandler: AsyncHandler<typeof handler> =
    handler.length > 2
      ? (event, context) =>
          new Promise((resolve, reject) => {
            const rv = (handler as SyncHandler<typeof handler>)(event, context, (error, result) => {
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
      : (handler as AsyncHandler<typeof handler>);

  return async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

    // In seconds. You cannot go any more granular than this in AWS Lambda.
    const configuredTimeout = Math.ceil(tryGetRemainingTimeInMillis(context) / 1000);
    const configuredTimeoutMinutes = Math.floor(configuredTimeout / 60);
    const configuredTimeoutSeconds = configuredTimeout % 60;

    const humanReadableTimeout =
      configuredTimeoutMinutes > 0
        ? `${configuredTimeoutMinutes}m${configuredTimeoutSeconds}s`
        : `${configuredTimeoutSeconds}s`;

    // When `callbackWaitsForEmptyEventLoop` is set to false, which it should when using `captureTimeoutWarning`,
    // we don't have a guarantee that this message will be delivered. Because of that, we don't flush it.
    if (options.captureTimeoutWarning) {
      const timeoutWarningDelay = tryGetRemainingTimeInMillis(context) - options.timeoutWarningLimit;

      timeoutWarningTimer = setTimeout(() => {
        withScope(scope => {
          scope.setTag('timeout', humanReadableTimeout);
          captureMessage(`Possible function timeout: ${context.functionName}`, 'warning');
        });
      }, timeoutWarningDelay) as unknown as NodeJS.Timeout;
    }

    async function processResult(span?: Span): Promise<TResult> {
      const scope = getCurrentScope();

      let rv: TResult;
      try {
        enhanceScopeWithEnvironmentData(scope, context, START_TIME);

        rv = await asyncHandler(event, context);

        // We manage lambdas that use Promise.allSettled by capturing the errors of failed promises
        if (options.captureAllSettledReasons && Array.isArray(rv) && isPromiseAllSettledResult(rv)) {
          const reasons = getRejectedReasons(rv);
          reasons.forEach(exception => {
            captureException(exception, scope => markEventUnhandled(scope));
          });
        }
      } catch (e) {
        captureException(e, scope => markEventUnhandled(scope));
        throw e;
      } finally {
        clearTimeout(timeoutWarningTimer);
        if (span?.isRecording()) {
          span.end();
        }
        await flush(options.flushTimeout).catch(e => {
          DEBUG_BUILD && logger.error(e);
        });
      }
      return rv;
    }

    // Only start a trace and root span if the handler is not already wrapped by Otel instrumentation
    // Otherwise, we create two root spans (one from otel, one from our wrapper).
    // If Otel instrumentation didn't work or was filtered by users, we still want to trace the handler.
    // TODO(v9): Since bumping the OTEL Instrumentation, this is likely not needed anymore, we can possibly remove this
    if (options.startTrace && !isWrappedByOtel(handler)) {
      const traceData = getAwsTraceData(event as { headers?: Record<string, string> }, context);

      return continueTrace({ sentryTrace: traceData['sentry-trace'], baggage: traceData.baggage }, () => {
        return startSpanManual(
          {
            name: context.functionName,
            op: 'function.aws.lambda',
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless',
            },
          },
          span => {
            enhanceScopeWithTransactionData(getCurrentScope(), context);

            return processResult(span);
          },
        );
      });
    }

    return withScope(async () => {
      return processResult(undefined);
    });
  };
}

/**
 * Checks if Otel's AWSLambda instrumentation successfully wrapped the handler.
 * Check taken from @opentelemetry/core
 */
function isWrappedByOtel(
  // eslint-disable-next-line @typescript-eslint/ban-types
  handler: Function & { __original?: unknown; __unwrap?: unknown; __wrapped?: boolean },
): boolean {
  return (
    typeof handler === 'function' &&
    typeof handler.__original === 'function' &&
    typeof handler.__unwrap === 'function' &&
    handler.__wrapped === true
  );
}
