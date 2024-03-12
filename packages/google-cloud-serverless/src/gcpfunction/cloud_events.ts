import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, handleCallbackErrors } from '@sentry/core';
import { captureException, flush, getCurrentScope, startSpanManual } from '@sentry/node';
import { logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { domainify, markEventUnhandled, proxyFunction } from '../utils';
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
  return proxyFunction(fn, f => domainify(_wrapCloudEventFunction(f, wrapOptions)));
}

function _wrapCloudEventFunction(
  fn: CloudEventFunction | CloudEventFunctionWithCallback,
  wrapOptions: Partial<CloudEventFunctionWrapperOptions> = {},
): CloudEventFunctionWithCallback {
  const options: CloudEventFunctionWrapperOptions = {
    flushTimeout: 2000,
    ...wrapOptions,
  };
  return (context, callback) => {
    return startSpanManual(
      {
        name: context.type || '<unknown>',
        op: 'function.gcp.cloud_event',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
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
              callback(...args);
            });
        });

        if (fn.length > 1) {
          return handleCallbackErrors(
            () => (fn as CloudEventFunctionWithCallback)(context, newCallback),
            err => {
              captureException(err, scope => markEventUnhandled(scope));
            },
          );
        }

        return Promise.resolve()
          .then(() => (fn as CloudEventFunction)(context))
          .then(
            result => newCallback(null, result),
            err => newCallback(err, undefined),
          );
      },
    );
  };
}
