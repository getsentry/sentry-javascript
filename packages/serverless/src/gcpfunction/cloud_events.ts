import { runWithAsyncContext } from '@sentry/core';
import { captureException, flush, getCurrentHub } from '@sentry/node';
import { isThenable, logger } from '@sentry/utils';

import { proxyFunction } from '../utils';
import type { CloudEventFunction, CloudEventFunctionWithCallback, WrapperOptions } from './general';

export type CloudEventFunctionWrapperOptions = WrapperOptions;

/**
 * Wraps an event function handler adding it error capture and tracing capabilities.
 *
 * @param fn Event handler
 * @param options Options
 * @returns Event handler
 */
export function wrapCloudEventFunction(
  fn: CloudEventFunction | CloudEventFunctionWithCallback,
  wrapOptions: Partial<CloudEventFunctionWrapperOptions> = {},
): CloudEventFunctionWithCallback {
  return proxyFunction(fn, f =>
    runWithAsyncContext(() => _wrapCloudEventFunction(f, wrapOptions), { reuseExisting: true }),
  );
}

/** */
function _wrapCloudEventFunction(
  fn: CloudEventFunction | CloudEventFunctionWithCallback,
  wrapOptions: Partial<CloudEventFunctionWrapperOptions> = {},
): CloudEventFunctionWithCallback {
  const options: CloudEventFunctionWrapperOptions = {
    flushTimeout: 2000,
    ...wrapOptions,
  };
  return (context, callback) => {
    const hub = getCurrentHub();

    const transaction = hub.startTransaction({
      name: context.type || '<unknown>',
      op: 'function.gcp.cloud_event',
      metadata: { source: 'component' },
    });

    // getCurrentHub() is expected to use current active domain as a carrier
    // since functions-framework creates a domain for each incoming request.
    // So adding of event processors every time should not lead to memory bloat.
    hub.configureScope(scope => {
      scope.setContext('gcp.function.context', { ...context });
      // We put the transaction on the scope so users can attach children to it
      scope.setSpan(transaction);
    });

    const newCallback = (...args: unknown[]): void =>
      runWithAsyncContext(
        () => {
          if (args[0] !== null && args[0] !== undefined) {
            captureException(args[0]);
          }
          transaction.finish();

          void flush(options.flushTimeout)
            .then(null, e => {
              __DEBUG_BUILD__ && logger.error(e);
            })
            .then(() => {
              callback(...args);
            });
        },
        { reuseExisting: true },
      );

    if (fn.length > 1) {
      let fnResult;
      try {
        fnResult = (fn as CloudEventFunctionWithCallback)(context, newCallback);
      } catch (err) {
        captureException(err);
        throw err;
      }

      if (isThenable(fnResult)) {
        fnResult.then(null, err => {
          captureException(err);
          throw err;
        });
      }

      return fnResult;
    }

    return Promise.resolve()
      .then(() => (fn as CloudEventFunction)(context))
      .then(
        result => newCallback(null, result),
        err => newCallback(err, undefined),
      );
  };
}
