import type { Span } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import type { Scope } from '@sentry/core';
import { _INTERNAL_setSpanForScope, getCapturedScopesOnSpan, getCurrentScope } from '@sentry/core';
import { SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY } from './constants';

/**
 * Forks the current scope and sets the provided span as active span in the context of the provided callback. Can be
 * passed `null` to start an entirely new span tree.
 *
 * @param span Spans started in the context of the provided callback will be children of this span. If `null` is passed,
 * spans started within the callback will be root spans.
 * @param callback Execution context in which the provided span will be active. Is passed the newly forked scope.
 * @returns the value returned from the provided callback function.
 */
export function withActiveSpan<T>(span: Span | null, callback: (scope: Scope) => T): T {
  let newContextWithActiveSpan = span ? trace.setSpan(context.active(), span) : trace.deleteSpan(context.active());

  // Mirror `SentryTracer.startActiveSpan`: run the callback under the isolation scope captured when
  // the span was created, so scope state used or set while it is active (tags, breadcrumbs,
  // captured errors) belongs to that span and stays isolated from other concurrent work. Spans
  // without captured scopes (e.g. foreign OTel spans) are unaffected.
  const capturedIsolationScope = span ? getCapturedScopesOnSpan(span).isolationScope : undefined;
  if (capturedIsolationScope) {
    newContextWithActiveSpan = newContextWithActiveSpan.setValue(
      SENTRY_FORK_SET_ISOLATION_SCOPE_CONTEXT_KEY,
      capturedIsolationScope,
    );
  }

  return context.with(newContextWithActiveSpan, () => {
    const scope = getCurrentScope();
    // Keep the scope's span in sync with the context, like `SentryTracer.startActiveSpan` does.
    _INTERNAL_setSpanForScope(scope, span ?? undefined);
    return callback(scope);
  });
}
