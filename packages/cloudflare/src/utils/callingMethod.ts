import { CODE_FUNCTION_NAME } from '@sentry/conventions/attributes';
import { getActiveSpan, spanToJSON } from '@sentry/core';

/**
 * Returns the function name declared by the enclosing active span via its `code.function.name`
 * attribute. The SDK stamps that attribute on its own Durable Object method spans (RPC methods,
 * `alarm`, `webSocket*` handlers, Agent `@callable()` spans), so storage spans can show which
 * method triggered them.
 *
 * Returns `undefined` when there is no active span or the enclosing span declares no function name
 * (e.g. an `http.server` span from a Durable Object `fetch()` handler, or a user-created span) —
 * we deliberately don't fall back to the span description, which is a span name, not a function
 * name, and would misattribute routes (`GET /path`) or user span names as functions.
 */
export function getCallingMethodName(): string | undefined {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const functionName = spanToJSON(activeSpan).data?.[CODE_FUNCTION_NAME];

  return typeof functionName === 'string' ? functionName : undefined;
}
