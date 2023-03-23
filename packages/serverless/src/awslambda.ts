/* eslint-disable max-lines */
import type { Scope } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { captureException, captureMessage, flush, getCurrentHub, withScope } from '@sentry/node';
import { extractTraceparentData } from '@sentry/tracing';
import type { Integration } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext, dsnFromString, dsnToString, isString, logger } from '@sentry/utils';
// NOTE: I have no idea how to fix this right now, and don't want to waste more time, as it builds just fine — Kamil
// eslint-disable-next-line import/no-unresolved
import type { Context, Handler } from 'aws-lambda';
import { existsSync } from 'fs';
import { hostname } from 'os';
import { basename, resolve } from 'path';
import { performance } from 'perf_hooks';
import { types } from 'util';

import { AWSServices } from './awsservices';
import { serverlessEventProcessor } from './utils';

export * from '@sentry/node';

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
  // TODO: DEPRECATED - remove `rethrowAfterCapture` in v7
  rethrowAfterCapture?: boolean;
  callbackWaitsForEmptyEventLoop: boolean;
  captureTimeoutWarning: boolean;
  timeoutWarningLimit: number;
  /**
   * Capture all errors when `Promise.allSettled` is returned by the handler
   * The {@link wrapHandler} will not fail the lambda even if there are errors
   * @default false
   */
  captureAllSettledReasons: boolean;
}

export const defaultIntegrations: Integration[] = [...Sentry.defaultIntegrations, new AWSServices({ optional: true })];

/**
 * Changes a Dsn to point to the `relay` server running in the Lambda Extension.
 *
 * This is only used by the serverless integration for AWS Lambda.
 *
 * @param originalDsn The original Dsn of the customer.
 * @returns Dsn pointing to Lambda extension.
 */
function extensionRelayDSN(originalDsn: string | undefined): string | undefined {
  if (originalDsn === undefined) {
    return undefined;
  }

  const dsn = dsnFromString(originalDsn);
  dsn.host = 'localhost';
  dsn.port = '5333';
  dsn.protocol = 'http';

  return dsnToString(dsn);
}

interface AWSLambdaOptions extends Sentry.NodeOptions {
  /**
   * Internal field that is set to `true` when init() is called by the Sentry AWS Lambda layer.
   *
   */
  _invokedByLambdaLayer?: boolean;
}

/**
 * @see {@link Sentry.init}
 */
export function init(options: AWSLambdaOptions = {}): void {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = defaultIntegrations;
  }

  options._metadata = options._metadata || {};
  options._metadata.sdk = {
    name: 'sentry.javascript.serverless',
    integrations: ['AWSLambda'],
    packages: [
      {
        name: 'npm:@sentry/serverless',
        version: Sentry.SDK_VERSION,
      },
    ],
    version: Sentry.SDK_VERSION,
  };

  // If invoked by the Sentry Lambda Layer point the SDK to the Lambda Extension (inside the layer) instead of the host
  // specified in the DSN
  if (options._invokedByLambdaLayer) {
    options.dsn = extensionRelayDSN(options.dsn);
  }

  Sentry.init(options);
  Sentry.addGlobalEventProcessor(serverlessEventProcessor);
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
    __DEBUG_BUILD__ && logger.error(`Bad handler ${handlerDesc}`);
    return;
  }

  const [, handlerMod, handlerName] = match;

  let obj: HandlerBag;
  try {
    const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
    obj = tryRequire(taskRoot, handlerDir, handlerMod);
  } catch (e) {
    __DEBUG_BUILD__ && logger.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
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
    __DEBUG_BUILD__ && logger.error(`${handlerPath} is undefined or not exported`);
    return;
  }
  if (typeof obj !== 'function') {
    __DEBUG_BUILD__ && logger.error(`${handlerPath} is not a function`);
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
  scope.setTransactionName(context.functionName);

  scope.setTag('server_name', process.env._AWS_XRAY_DAEMON_ADDRESS || process.env.SENTRY_NAME || hostname());
  scope.setTag('url', `awslambda:///${context.functionName}`);

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
  const options: WrapperOptions = {
    flushTimeout: 2000,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    captureAllSettledReasons: false,
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

    // Applying `sentry-trace` to context
    let traceparentData;
    const eventWithHeaders = event as { headers?: { [key: string]: string } };
    if (eventWithHeaders.headers && isString(eventWithHeaders.headers['sentry-trace'])) {
      traceparentData = extractTraceparentData(eventWithHeaders.headers['sentry-trace']);
    }

    const baggageHeader = eventWithHeaders.headers && eventWithHeaders.headers.baggage;
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

    const hub = getCurrentHub();

    const transaction = hub.startTransaction({
      name: context.functionName,
      op: 'function.aws.lambda',
      ...traceparentData,
      metadata: {
        dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
        source: 'component',
      },
    });

    const scope = hub.pushScope();
    let rv: TResult;
    try {
      enhanceScopeWithEnvironmentData(scope, context, START_TIME);
      // We put the transaction on the scope so users can attach children to it
      scope.setSpan(transaction);
      rv = await asyncHandler(event, context);

      // We manage lambdas that use Promise.allSettled by capturing the errors of failed promises
      if (options.captureAllSettledReasons && Array.isArray(rv) && isPromiseAllSettledResult(rv)) {
        const reasons = getRejectedReasons(rv);
        reasons.forEach(exception => {
          captureException(exception);
        });
      }
    } catch (e) {
      captureException(e);
      throw e;
    } finally {
      clearTimeout(timeoutWarningTimer);
      transaction.finish();
      hub.popScope();
      await flush(options.flushTimeout).catch(e => {
        __DEBUG_BUILD__ && logger.error(e);
      });
    }
    return rv;
  };
}
