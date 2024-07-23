import { SPAN_STATUS_ERROR, handleCallbackErrors } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  continueTrace,
  startSpan,
  withIsolationScope,
} from '@sentry/node';
import { winterCGRequestToRequestData } from '@sentry/utils';
import { getRequestEvent } from 'solid-js/web';
import { flushIfServerless, getTracePropagationData, isRedirect } from './utils';

/**
 * Wraps a server action (functions that use the 'use server' directive) function body with Sentry Error and Performance instrumentation.
 */
export async function withServerActionInstrumentation<A extends (...args: unknown[]) => unknown>(
  serverActionName: string,
  callback: A,
): Promise<ReturnType<A>> {
  return withIsolationScope(isolationScope => {
    const event = getRequestEvent();

    if (event && event.request) {
      isolationScope.setSDKProcessingMetadata({ request: winterCGRequestToRequestData(event.request) });
    }
    isolationScope.setTransactionName(serverActionName);

    return continueTrace(getTracePropagationData(event), () => instrumentServerAction(serverActionName, callback));
  });
}

async function instrumentServerAction<A extends (...args: unknown[]) => unknown>(
  name: string,
  callback: A,
): Promise<ReturnType<A>> {
  try {
    return await startSpan(
      {
        op: 'function.server_action',
        name,
        forceTransaction: true,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
        },
      },
      async span => {
        const result = await handleCallbackErrors(callback, error => {
          if (!isRedirect(error)) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'solidstart',
              },
            });
          }
        });

        return result;
      },
    );
  } finally {
    await flushIfServerless();
  }
}
