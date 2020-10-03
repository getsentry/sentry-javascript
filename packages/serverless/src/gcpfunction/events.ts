// '@google-cloud/functions-framework/build/src/functions' import is expected to be type-only so it's erased in the final .js file.
// When TypeScript compiler is upgraded, use `import type` syntax to explicitly assert that we don't want to load a module here.
import { EventFunction, EventFunctionWithCallback } from '@google-cloud/functions-framework/build/src/functions';
import { flush, getCurrentHub, startTransaction } from '@sentry/node';
import { logger } from '@sentry/utils';

import { captureEventError, getActiveDomain, WrapperOptions } from './general';

export type EventFunctionWrapperOptions = WrapperOptions;

/**
 * Wraps an event function handler adding it error capture and tracing capabilities.
 *
 * @param fn Event handler
 * @param options Options
 * @returns Event handler
 */
export function wrapEventFunction(
  fn: EventFunction | EventFunctionWithCallback,
  wrapOptions: Partial<EventFunctionWrapperOptions> = {},
): EventFunctionWithCallback {
  const options: EventFunctionWrapperOptions = {
    flushTimeout: 2000,
    ...wrapOptions,
  };
  return (data, context, callback) => {
    const transaction = startTransaction({
      name: context.eventType,
      op: 'gcp.function.event',
    });

    // We put the transaction on the scope so users can attach children to it
    getCurrentHub().configureScope(scope => {
      scope.setSpan(transaction);
    });

    const activeDomain = getActiveDomain();

    activeDomain.on('error', err => {
      captureEventError(err, context);
    });

    const newCallback = activeDomain.bind((...args: unknown[]) => {
      if (args[0] !== null && args[0] !== undefined) {
        captureEventError(args[0], context);
      }
      transaction.finish();

      flush(options.flushTimeout)
        .then(() => {
          callback(...args);
        })
        .then(null, e => {
          logger.error(e);
        });
    });

    if (fn.length > 2) {
      return (fn as EventFunctionWithCallback)(data, context, newCallback);
    }

    Promise.resolve()
      .then(() => (fn as EventFunction)(data, context))
      .then(
        result => {
          newCallback(null, result);
        },
        err => {
          newCallback(err, undefined);
        },
      );
  };
}
