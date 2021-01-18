import {
  captureException,
  captureMessage,
  flush,
  getCurrentHub,
  Scope,
  Severity,
  startTransaction,
  withScope,
} from '@sentry/node';
import * as Sentry from '@sentry/node';
import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';
// NOTE: I have no idea how to fix this right now, and don't want to waste more time, as it builds just fine — Kamil
// eslint-disable-next-line import/no-unresolved
import { Context, Handler } from 'aws-lambda';
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
  rethrowAfterCapture: boolean;
  callbackWaitsForEmptyEventLoop: boolean;
  captureTimeoutWarning: boolean;
  timeoutWarningLimit: number;
}

export const defaultIntegrations: Integration[] = [...Sentry.defaultIntegrations, new AWSServices({ optional: true })];

/**
 * @see {@link Sentry.init}
 */
export function init(options: Sentry.NodeOptions = {}): void {
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
export function tryPatchHandler(taskRoot: string, handlerPath: string): void {
  type HandlerBag = HandlerModule | Handler | null | undefined;
  interface HandlerModule {
    [key: string]: HandlerBag;
  }

  const handlerDesc = basename(handlerPath);
  const match = handlerDesc.match(/^([^.]*)\.(.*)$/);
  if (!match) {
    logger.error(`Bad handler ${handlerDesc}`);
    return;
  }

  const [, handlerMod, handlerName] = match;

  let obj: HandlerBag;
  try {
    const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
    obj = tryRequire(taskRoot, handlerDir, handlerMod);
  } catch (e) {
    logger.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
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
    logger.error(`${handlerPath} is undefined or not exported`);
    return;
  }
  if (typeof obj !== 'function') {
    logger.error(`${handlerPath} is not a function`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  (mod as HandlerModule)[functionName!] = wrapHandler(obj as Handler);
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

  scope.setContext('runtime', {
    name: 'node',
    version: global.process.version,
  });

  scope.setContext('aws.lambda', {
    aws_request_id: context.awsRequestId,
    function_name: context.functionName,
    function_version: context.functionVersion,
    invoked_function_arn: context.invokedFunctionArn,
    execution_duration_in_millis: performance.now() - startTime,
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
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param options Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  wrapOptions: Partial<WrapperOptions> = {},
): Handler<TEvent, TResult | undefined> {
  const START_TIME = performance.now();
  const options: WrapperOptions = {
    flushTimeout: 2000,
    rethrowAfterCapture: true,
    callbackWaitsForEmptyEventLoop: false,
    captureTimeoutWarning: true,
    timeoutWarningLimit: 500,
    ...wrapOptions,
  };
  let timeoutWarningTimer: NodeJS.Timeout;

  // AWSLambda is like Express. It makes a distinction about handlers based on it's last argument
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
              (rv as Promise<NonNullable<TResult>>).then(resolve, reject);
            }
          })
      : (handler as AsyncHandler<typeof handler>);

  return async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

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
    if (options.captureTimeoutWarning) {
      const timeoutWarningDelay = context.getRemainingTimeInMillis() - options.timeoutWarningLimit;

      timeoutWarningTimer = setTimeout(() => {
        withScope(scope => {
          scope.setTag('timeout', humanReadableTimeout);
          captureMessage(`Possible function timeout: ${context.functionName}`, Severity.Warning);
        });
      }, timeoutWarningDelay);
    }

    const transaction = startTransaction({
      name: context.functionName,
      op: 'awslambda.handler',
    });

    const hub = getCurrentHub();
    const scope = hub.pushScope();
    let rv: TResult | undefined;
    try {
      enhanceScopeWithEnvironmentData(scope, context, START_TIME);
      // We put the transaction on the scope so users can attach children to it
      scope.setSpan(transaction);
      rv = await asyncHandler(event, context);
    } catch (e) {
      captureException(e);
      if (options.rethrowAfterCapture) {
        throw e;
      }
    } finally {
      clearTimeout(timeoutWarningTimer);
      transaction.finish();
      hub.popScope();
      await flush(options.flushTimeout);
    }
    return rv;
  };
}
