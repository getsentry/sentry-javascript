// PUBLIC APIS

import type { Span } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import type { CaptureContext, Event, EventHint, Scope, SeverityLevel } from '@sentry/types';
import { getContextFromScope, getScopesFromContext, setScopesOnContext } from '../utils/contextData';

import type { ExclusiveEventHintOrCaptureContext } from '../utils/prepareEvent';
import { parseEventHintOrCaptureContext } from '../utils/prepareEvent';
import { getClient, getCurrentScope, getIsolationScope } from './scope';

export { getCurrentScope, getIsolationScope, getClient };
export { setCurrentScope, setIsolationScope } from './scope';

/**
 * Creates a new scope with and executes the given operation within.
 * The scope is automatically removed once the operation
 * finishes or throws.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope();
 *     callback();
 *     popScope();
 */
export function withScope<T>(callback: (scope: Scope) => T): T;
/**
 * Set the given scope as the active scope in the callback.
 */
export function withScope<T>(scope: Scope | undefined, callback: (scope: Scope) => T): T;
/**
 * Either creates a new active scope, or sets the given scope as active scope in the given callback.
 */
export function withScope<T>(
  ...rest: [callback: (scope: Scope) => T] | [scope: Scope | undefined, callback: (scope: Scope) => T]
): T {
  // If a scope is defined, we want to make this the active scope instead of the default one
  if (rest.length === 2) {
    const [scope, callback] = rest;
    if (!scope) {
      return context.with(context.active(), () => callback(getCurrentScope()));
    }

    const ctx = getContextFromScope(scope);
    return context.with(ctx || context.active(), () => callback(getCurrentScope()));
  }

  const callback = rest[0];
  return context.with(context.active(), () => callback(getCurrentScope()));
}

/**
 * Forks the current scope and sets the provided span as active span in the context of the provided callback.
 *
 * @param span Spans started in the context of the provided callback will be children of this span.
 * @param callback Execution context in which the provided span will be active. Is passed the newly forked scope.
 * @returns the value returned from the provided callback function.
 */
export function withActiveSpan<T>(span: Span, callback: (scope: Scope) => T): T {
  const newContextWithActiveSpan = trace.setSpan(context.active(), span);
  return context.with(newContextWithActiveSpan, () => callback(getCurrentScope()));
}

/**
 * For a new isolation scope from the current isolation scope,
 * and make it the current isolation scope in the given callback.
 */
export function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
  const ctx = context.active();
  const currentScopes = getScopesFromContext(ctx);
  const scopes = currentScopes
    ? { ...currentScopes }
    : {
        scope: getCurrentScope(),
        isolationScope: getIsolationScope(),
      };

  scopes.isolationScope = scopes.isolationScope.clone();

  return context.with(setScopesOnContext(ctx, scopes), () => {
    return callback(getIsolationScope());
  });
}

/** Record an exception and send it to Sentry. */
export function captureException(exception: unknown, hint?: ExclusiveEventHintOrCaptureContext): string {
  return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
}

/** Record a message and send it to Sentry. */
export function captureMessage(message: string, captureContext?: CaptureContext | SeverityLevel): string {
  // This is necessary to provide explicit scopes upgrade, without changing the original
  // arity of the `captureMessage(message, level)` method.
  const level = typeof captureContext === 'string' ? captureContext : undefined;
  const context = typeof captureContext !== 'string' ? { captureContext } : undefined;

  return getCurrentScope().captureMessage(message, level, context);
}

/** Capture a generic event and send it to Sentry. */
export function captureEvent(event: Event, hint?: EventHint): string {
  return getCurrentScope().captureEvent(event, hint);
}
