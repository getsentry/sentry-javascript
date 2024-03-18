import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, handleCallbackErrors } from '@sentry/core';
import { captureException, flush, getCurrentScope, startSpanManual } from '@sentry/node';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { domainify, markEventUnhandled, proxyFunction } from '../utils';
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

    return startSpanManual(
      {
        name: context.eventType,
        op: 'function.gcp.event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
        },
      },
      span => {
        const scope = getCurrentScope();
        scope.setContext('gcp.function.context', { ...context });

        const newCallback = domainify((...args: unknown[]) => {
          if (args[0] !== null && args[0] !== undefined) {
            captureException(args[0], scope => markEventUnhandled(scope));
          }
          span.end();

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          flush(options.flushTimeout)
            .then(null, e => {
              DEBUG_BUILD && logger.error(e);
            })
            .then(() => {
              if (typeof callback === 'function') {
                callback(...args);
              }
            });
        });

        if (fn.length > 2) {
          return handleCallbackErrors(
            () => (fn as EventFunctionWithCallback)(data, context, newCallback),
            err => {
              captureException(err, scope => markEventUnhandled(scope));
            },
          );
        }

        return Promise.resolve()
          .then(() => (fn as EventFunction)(data, context))
          .then(
            result => newCallback(null, result),
            err => newCallback(err, undefined),
          );
      },
    );
  };
}
