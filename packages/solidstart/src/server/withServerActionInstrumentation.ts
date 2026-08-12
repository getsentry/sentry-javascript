import {
  flushIfServerless,
  handleCallbackErrors,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
} from '@sentry/core';
import {
  captureException,
  getActiveSpan,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  spanToStreamedSpanJSON,
  startSpan,
} from '@sentry/node';
import { isRedirect } from './utils';
import { HTTP_ROUTE, HTTP_TARGET, SENTRY_OP, URL_PATH } from '@sentry/conventions/attributes';
import { WEB_SERVER_FUNCTION_SPAN_OP } from '@sentry/conventions/op';
import { setHttpServerSpanRouteAttribute } from '@sentry/server-utils';

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
    const spanData = spanToStreamedSpanJSON(activeSpan).attributes;

    // In solid start, server function calls are made to `/_server` which doesn't tell us
    // a lot. We rewrite the span's route to be that of the sever action name but only
    // if the target is `/_server`, otherwise we'd overwrite pageloads on routes that use
    // server actions (which are more meaningful, e.g. a request to `GET /users/5` is more
    // meaningful than overwriting it with `GET doSomeFunctionCall`).
    // `@sentry/node` HTTP spans only carry `url.path`; the deprecated `http.target` is kept as a
    // fallback for instrumentation that still sets only that.
    // oxlint-disable-next-line typescript/no-deprecated
    const requestPath = spanData?.[URL_PATH] ?? spanData?.[HTTP_TARGET];

    if (spanData && !spanData[HTTP_ROUTE] && requestPath === '/_server') {
      setHttpServerSpanRouteAttribute(serverActionName);
    }
  }

  try {
    return await startSpan(
      {
        name: serverActionName,
        attributes: {
          [SENTRY_OP]: WEB_SERVER_FUNCTION_SPAN_OP,
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.solidstart',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'component',
        },
      },
      async span => {
        // oxlint-disable-next-line typescript/await-thenable -- callback may be async at runtime
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
