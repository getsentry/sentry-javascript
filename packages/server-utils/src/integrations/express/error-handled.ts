import { addNonEnumerableProperty } from '@sentry/core';

// Non-enumerable marker set on the Express *request* once the channel-based `expressIntegration()` has
// taken responsibility for an error on it — either captured it, or deliberately skipped it per
// `shouldHandleError`. The deprecated `expressErrorHandler` middleware reads this to defer to the
// integration, so an Express error is only ever handled once and the integration's `shouldHandleError`
// decision always wins.
//
// The marker lives on the request (not the error) on purpose: the request is always a mutable object
// and is the same instance across every layer the error bubbles through and the error-handling
// middleware, whereas the thrown value may be frozen or a primitive. It also does not rely on
// `captureException`'s global `__sentry_captured__` dedup, which is only set when an error is actually
// captured and so cannot express a "deliberately skipped" decision.
const EXPRESS_ERROR_HANDLED = '__sentry_express_error_handled__';

/**
 * Mark an Express request as having had its error handled by the channel-based `expressIntegration()`,
 * so the deprecated `expressErrorHandler` middleware defers to that decision.
 */
export function markExpressErrorHandled(request: unknown): void {
  if (request && typeof request === 'object') {
    addNonEnumerableProperty(request, EXPRESS_ERROR_HANDLED, true);
  }
}

/**
 * Whether the channel-based `expressIntegration()` has already handled an error on this Express request.
 */
export function isExpressErrorHandled(request: unknown): boolean {
  return !!(request && typeof request === 'object' && (request as Record<string, unknown>)[EXPRESS_ERROR_HANDLED]);
}
