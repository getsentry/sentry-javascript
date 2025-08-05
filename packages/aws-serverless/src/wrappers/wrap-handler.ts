import { consoleSandbox, debug } from '@sentry/core';
import { captureException, flush, getCurrentScope, withScope } from '@sentry/node';
import type { Context, Handler, StreamifyHandler } from 'aws-lambda';
import { isPromise } from 'util/types';
import { DEBUG_BUILD } from '../debug-build';
import { markEventUnhandled } from '../utils';
import {
  type WrapperOptions,
  AWS_HANDLER_STREAMING,
  AWS_STREAM_RESPONSE,
  createDefaultWrapperOptions,
  enhanceScopeWithEnvironmentData,
  setupTimeoutWarning,
} from './common';
import { wrapStreamingHandler } from './wrap-streaming-handler';

/**
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param options Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult>,
  wrapOptions?: Partial<WrapperOptions>,
): Handler<TEvent, TResult>;

/**
 * Wraps a streaming lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Streaming Handler
 * @param options Options
 * @returns Streaming Handler
 */
export function wrapHandler<TEvent, TResult>(
  handler: StreamifyHandler<TEvent, TResult>,
  wrapOptions?: Partial<WrapperOptions>,
): StreamifyHandler<TEvent, TResult>;

/**
 * Implementation function that wraps both regular and streaming handlers
 */
export function wrapHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult>,
  wrapOptions: Partial<WrapperOptions> = {},
): Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult> {
  // eslint-disable-next-line deprecation/deprecation
  if (typeof wrapOptions.startTrace !== 'undefined') {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        'The `startTrace` option is deprecated and will be removed in a future major version. If you want to disable tracing, set `SENTRY_TRACES_SAMPLE_RATE` to `0.0`.',
      );
    });
  }

  if (isStreamingHandler(handler)) {
    return wrapStreamingHandler(handler, wrapOptions);
  }

  const START_TIME = performance.now();
  const options = createDefaultWrapperOptions(wrapOptions);
  let timeoutWarningTimer: NodeJS.Timeout | undefined;

  // AWSLambda is like Express. It makes a distinction about handlers based on its last argument
  // async (event) => async handler
  // async (event, context) => async handler
  // (event, context, callback) => sync handler
  // Nevertheless whatever option is chosen by user, we convert it to async handler.
  const regularHandler = handler as Handler<TEvent, TResult>;
  const asyncHandler: AsyncHandler<typeof regularHandler> =
    regularHandler.length > 2
      ? (event, context) =>
          new Promise((resolve, reject) => {
            const rv = (regularHandler as SyncHandler<typeof regularHandler>)(event, context, (error, result) => {
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
      : (regularHandler as AsyncHandler<typeof regularHandler>);

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
            captureException(exception, scope => markEventUnhandled(scope, 'auto.function.aws-serverless.promise'));
          });
        }
      } catch (e) {
        captureException(e, scope => markEventUnhandled(scope, 'auto.function.aws-serverless.handler'));
        throw e;
      } finally {
        if (timeoutWarningTimer) {
          clearTimeout(timeoutWarningTimer);
        }

        await flush(options.flushTimeout).catch(e => {
          DEBUG_BUILD && debug.error(e);
        });
      }
      return rv;
    }

    return withScope(() => processResult());
  };
}

function isStreamingHandler<TEvent, TResult>(
  handler: Handler<TEvent, TResult> | StreamifyHandler<TEvent, TResult>,
): handler is StreamifyHandler<TEvent, TResult> {
  return (handler as unknown as Record<symbol, unknown>)[AWS_HANDLER_STREAMING] === AWS_STREAM_RESPONSE;
}

type AsyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
) => Promise<NonNullable<Parameters<Parameters<T>[2]>[1]>>;

// https://www.npmjs.com/package/aws-lambda-consumer
type SyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
  callback: Parameters<T>[2],
) => void;

type PromiseSettledResult<T> = { status: 'rejected' | 'fulfilled'; reason?: T };

function getRejectedReasons<T>(results: PromiseSettledResult<T>[]): T[] {
  return results.reduce((rejected: T[], result) => {
    if (result.status === 'rejected' && result.reason) rejected.push(result.reason);
    return rejected;
  }, []);
}

function isPromiseAllSettledResult<T>(result: T[]): boolean {
  return result.every(
    v =>
      Object.prototype.hasOwnProperty.call(v, 'status') &&
      (Object.prototype.hasOwnProperty.call(v, 'value') || Object.prototype.hasOwnProperty.call(v, 'reason')),
  );
}
