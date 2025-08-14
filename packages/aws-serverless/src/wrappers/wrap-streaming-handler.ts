import { debug } from '@sentry/core';
import { captureException, flush, getCurrentScope, withScope } from '@sentry/node';
import type { Context, StreamifyHandler } from 'aws-lambda';
import { DEBUG_BUILD } from '../debug-build';
import { markEventUnhandled } from '../utils';
import {
  type WrapperOptions,
  AWS_HANDLER_HIGHWATERMARK,
  AWS_HANDLER_STREAMING,
  createDefaultWrapperOptions,
  enhanceScopeWithEnvironmentData,
  setupTimeoutWarning,
} from './common';

type HttpResponseStream = Parameters<StreamifyHandler>[1];

/**
 *
 */
export function wrapStreamingHandler<TEvent, TResult>(
  handler: StreamifyHandler<TEvent, TResult>,
  wrapOptions: Partial<WrapperOptions> = {},
): StreamifyHandler<TEvent, TResult> {
  const START_TIME = performance.now();
  const options = createDefaultWrapperOptions(wrapOptions);
  let timeoutWarningTimer: NodeJS.Timeout | undefined;

  const wrappedHandler = async (
    event: TEvent,
    responseStream: HttpResponseStream,
    context: Context,
  ): Promise<TResult> => {
    context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

    timeoutWarningTimer = setupTimeoutWarning(context, options);

    async function processStreamingResult(): Promise<TResult> {
      const scope = getCurrentScope();

      try {
        enhanceScopeWithEnvironmentData(scope, context, START_TIME);

        responseStream.on('error', error => {
          captureException(error, scope => markEventUnhandled(scope, 'auto.function.aws-serverless.stream'));
        });

        return await handler(event, responseStream, context);
      } catch (e) {
        captureException(e, scope => markEventUnhandled(scope, 'auto.function.aws-serverless.handler'));
        throw e;
      } finally {
        if (timeoutWarningTimer) {
          clearTimeout(timeoutWarningTimer);
        }

        await flush(options.flushTimeout).catch(e => DEBUG_BUILD && debug.error(e));
      }
    }

    return withScope(() => processStreamingResult());
  };

  const handlerWithSymbols = handler as unknown as Record<symbol, unknown>;
  (wrappedHandler as unknown as Record<symbol, unknown>)[AWS_HANDLER_STREAMING] =
    handlerWithSymbols[AWS_HANDLER_STREAMING];
  (wrappedHandler as unknown as Record<symbol, unknown>)[AWS_HANDLER_HIGHWATERMARK] =
    handlerWithSymbols[AWS_HANDLER_HIGHWATERMARK];

  return wrappedHandler;
}
