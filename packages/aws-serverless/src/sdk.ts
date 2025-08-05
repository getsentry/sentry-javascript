import type { Integration, Options, Scope } from '@sentry/core';
import { applySdkMetadata, consoleSandbox, debug, getSDKSource } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import {
  captureException,
  captureMessage,
  flush,
  getCurrentScope,
  getDefaultIntegrationsWithoutPerformance,
  initWithoutDefaultIntegrations,
  withScope,
} from '@sentry/node';
import type { Context, Handler } from 'aws-lambda';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import { performance } from 'perf_hooks';
import { types } from 'util';
import { DEBUG_BUILD } from './debug-build';
import { awsIntegration } from './integration/aws';
import { awsLambdaIntegration } from './integration/awslambda';
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
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'aws-serverless', ['aws-serverless'], getSDKSource());

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
    DEBUG_BUILD && debug.error(`Bad handler ${handlerDesc}`);
    return;
  }

  const [, handlerMod = '', handlerName = ''] = match;

  let obj: HandlerBag;
  try {
    const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
    obj = tryRequire(taskRoot, handlerDir, handlerMod);
  } catch (e) {
    DEBUG_BUILD && debug.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
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
    DEBUG_BUILD && debug.error(`${handlerPath} is undefined or not exported`);
    return;
  }
  if (typeof obj !== 'function') {
    DEBUG_BUILD && debug.error(`${handlerPath} is not a function`);
    return;
  }

  // Check for prototype pollution
  if (functionName === '__proto__' || functionName === 'constructor' || functionName === 'prototype') {
    DEBUG_BUILD && debug.error(`Invalid handler name: ${functionName}`);
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
            captureException(exception, scope => markEventUnhandled(scope, 'auto.function.aws-serverless.promise'));
          });
        }
      } catch (e) {
        captureException(e, scope => markEventUnhandled(scope, 'auto.function.aws-serverless.handler'));
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
