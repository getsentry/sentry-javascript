import {
  SENTRY_SEGMENT_NAME_SOURCE,
  FAAS_NAME,
  FAAS_TRIGGER,
  SENTRY_OP,
  GCP_FUNCTION_CONTEXT_EVENT_TYPE,
  GCP_FUNCTION_CONTEXT_EVENT_ID,
  GCP_FUNCTION_CONTEXT_RESOURCE,
  GCP_FUNCTION_CONTEXT_TIMESTAMP,
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

    const client = getClient();

    const functionName = getFunctionName();
    const name =
      client && hasSpanStreamingEnabled(client)
        ? functionName || SERVERLESS_FUNCTION_SPAN_NAME_FALLBACK
        : context.eventType;

    return startSpanManual(
      {
        name,
        attributes: {
          [SENTRY_OP]: FUNCTION_GCP,
          [FAAS_NAME]: functionName,
          [FAAS_TRIGGER]: 'event',
          [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_event',
          // not yet in conventions but this attribute will also determine the span description
          [GCP_FUNCTION_CONTEXT_EVENT_TYPE]: context.eventType,
          [GCP_FUNCTION_CONTEXT_EVENT_ID]: context.eventId,
          [GCP_FUNCTION_CONTEXT_RESOURCE]: context.resource,
          [GCP_FUNCTION_CONTEXT_TIMESTAMP]: context.timestamp,
        },
      },
      span => {
        const scope = getCurrentScope();
        scope.setContext('gcp.function.context', { ...context });

        const newCallback = domainify((...args: unknown[]) => {
          if (args[0] !== null && args[0] !== undefined) {
            captureException(args[0], scope => markEventUnhandled(scope, 'auto.function.serverless.gcp_event'));
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

        if (fn.length > 2) {
          return handleCallbackErrors(
            () => (fn as EventFunctionWithCallback)(data, context, newCallback),
            err => {
              captureException(err, scope => markEventUnhandled(scope, 'auto.function.serverless.gcp_event'));
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
