import {
  flushIfServerless,
  handleCallbackErrors,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
} from '@sentry/core';
import { captureException, getActiveSpan, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, spanToJSON, startSpan } from '@sentry/node';
import { isRedirect } from './utils';

/**
 * Wraps a server action (functions that use the 'use server' directive)
 * function body with Sentry Error and Performance instrumentation.
 */
export async function withServerActionInstrumentation<A extends (...args: unknown[]) => unknown>(
  serverActionName: string,
  callback: A,
): Promise<ReturnType<A>> {
  const activeSpan = getActiveSpan();

  if (activeSpan) {
    const spanData = spanToJSON(activeSpan).data;

    // In solid start, server function calls are made to `/_server` which doesn't tell us
    // a lot. We rewrite the span's route to be that of the sever action name but only
    // if the target is `/_server`, otherwise we'd overwrite pageloads on routes that use
    // server actions (which are more meaningful, e.g. a request to `GET /users/5` is more
    // meaningful than overwriting it with `GET doSomeFunctionCall`).
    if (spanData && !spanData['http.route'] && spanData['http.target'] === '/_server') {
      activeSpan.setAttribute('http.route', serverActionName);
      activeSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'component');
    }
  }

  try {
    return await startSpan(
      {
        op: 'function.server_action',
        name: serverActionName,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.solidstart',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        },
      },
      async span => {
        const result = await handleCallbackErrors(callback, error => {
          if (!isRedirect(error)) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.function.solidstart',
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
