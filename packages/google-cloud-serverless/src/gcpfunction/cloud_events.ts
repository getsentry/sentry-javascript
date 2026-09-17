import {
  SENTRY_SEGMENT_NAME_SOURCE,
  FAAS_NAME,
  FAAS_TRIGGER,
  SENTRY_OP,
  GCP_FUNCTION_CONTEXT_TYPE,
  GCP_FUNCTION_CONTEXT_ID,
  GCP_FUNCTION_CONTEXT_SOURCE,
  GCP_FUNCTION_CONTEXT_SPECVERSION,
  GCP_FUNCTION_CONTEXT_TIME,
} from '@sentry/conventions/attributes';
import { FUNCTION_GCP } from '@sentry/conventions/op';
import {
  debug,
  getClient,
  handleCallbackErrors,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK,
} from '@sentry/core';
import { captureException, flush, getCurrentScope, startSpanManual } from '@sentry/node';
import { DEBUG_BUILD } from '../debug-build';
import { domainify, getFunctionName, markEventUnhandled, proxyFunction } from '../utils';
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
    const client = getClient();

    const functionName = getFunctionName();
    const name =
      client && hasSpanStreamingEnabled(client)
        ? functionName || SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK
        : context.type || '<unknown>';

    return startSpanManual(
      {
        name,
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: functionName,
          [FAAS_TRIGGER]: 'cloud_event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_cloud_event',
          [GCP_FUNCTION_CONTEXT_TYPE]: context.type,
          [GCP_FUNCTION_CONTEXT_ID]: context.id,
          [GCP_FUNCTION_CONTEXT_SOURCE]: context.source,
          [GCP_FUNCTION_CONTEXT_SPECVERSION]: context.specversion,
          [GCP_FUNCTION_CONTEXT_TIME]: context.time,
        },
      },
      span => {
        const scope = getCurrentScope();
        scope.setContext('gcp.function.context', { ...context });

        const newCallback = domainify((...args: unknown[]) => {
          if (args[0] !== null && args[0] !== undefined) {
            captureException(args[0], scope => markEventUnhandled(scope, 'auto.function.serverless.gcp_cloud_event'));
          }
          span.end();

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          flush(options.flushTimeout)
            .then(null, e => {
              DEBUG_BUILD && debug.error(e);
            })
            .then(() => {
              if (typeof callback === 'function') {
                callback(...args);
              }
            });
        });

        if (fn.length > 1) {
          return handleCallbackErrors(
            () => (fn as CloudEventFunctionWithCallback)(context, newCallback),
            err => {
              captureException(err, scope => markEventUnhandled(scope, 'auto.function.serverless.gcp_cloud_event'));
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
