import { captureException, flush, getCurrentHub } from '@sentry/node';
import { logger } from '@sentry/utils';

import { domainify, getActiveDomain, proxyFunction } from '../utils';
import type { EventFunction, EventFunctionWithCallback, WrapperOptions } from './general';

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
  return proxyFunction(fn, f => domainify(_wrapEventFunction(f, wrapOptions)));
}

/** */
function _wrapEventFunction<F extends EventFunction | EventFunctionWithCallback>(
  fn: F,
  wrapOptions: Partial<EventFunctionWrapperOptions> = {},
): (...args: Parameters<F>) => ReturnType<F> | Promise<void> {
  const options: EventFunctionWrapperOptions = {
    flushTimeout: 2000,
    ...wrapOptions,
  };
  return (...eventFunctionArguments: Parameters<F>): ReturnType<F> | Promise<void> => {
    const [data, context, callback] = eventFunctionArguments;

    const hub = getCurrentHub();

    const transaction = hub.startTransaction({
      name: context.eventType,
      op: 'function.gcp.event',
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

    const activeDomain = getActiveDomain()!; // eslint-disable-line @typescript-eslint/no-non-null-assertion

    activeDomain.on('error', captureException);

    const newCallback = activeDomain.bind((...args: unknown[]) => {
      if (args[0] !== null && args[0] !== undefined) {
        captureException(args[0]);
      }
      transaction.finish();

      void flush(options.flushTimeout)
        .then(null, e => {
          __DEBUG_BUILD__ && logger.error(e);
        })
        .then(() => {
          if (typeof callback === 'function') {
            callback(...args);
          }
        });
    });

    if (fn.length > 2) {
      return (fn as EventFunctionWithCallback)(data, context, newCallback);
    }

    return Promise.resolve()
      .then(() => (fn as EventFunction)(data, context))
      .then(
        result => newCallback(null, result),
        err => newCallback(err, undefined),
      );
  };
}
