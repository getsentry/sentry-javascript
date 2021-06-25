import { captureException, flush, getCurrentHub, startTransaction } from '@sentry/node';
import { logger } from '@sentry/utils';

import { domainify, getActiveDomain, proxyFunction } from '../utils';
import {
  CloudEventFunction,
  CloudEventFunctionWithCallback,
  configureScopeWithContext,
  WrapperOptions,
} from './general';

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
  return proxyFunction(fn, f => domainify(_wrapCloudEventFunction(f, wrapOptions)));
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
    const transaction = startTransaction({
      name: context.type || '<unknown>',
      op: 'gcp.function.cloud_event',
    });

    // getCurrentHub() is expected to use current active domain as a carrier
    // since functions-framework creates a domain for each incoming request.
    // So adding of event processors every time should not lead to memory bloat.
    getCurrentHub().configureScope(scope => {
      configureScopeWithContext(scope, context);
      // We put the transaction on the scope so users can attach children to it
      scope.setSpan(transaction);
    });

    const activeDomain = getActiveDomain()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion

    activeDomain.on('error', captureException);

    const newCallback = activeDomain.bind((...args: unknown[]) => {
      if (args[0] !== null && args[0] !== undefined) {
        captureException(args[0]);
      }
      transaction.finish();

      void flush(options.flushTimeout)
        .then(() => {
          callback(...args);
        })
        .then(null, e => {
          logger.error(e);
        });
    });

    if (fn.length > 1) {
      return (fn as CloudEventFunctionWithCallback)(context, newCallback);
    }

    return Promise.resolve()
      .then(() => (fn as CloudEventFunction)(context))
      .then(
        result => newCallback(null, result),
        err => newCallback(err, undefined),
      );
  };
}
