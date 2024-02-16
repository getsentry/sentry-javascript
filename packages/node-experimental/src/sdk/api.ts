// PUBLIC APIS

import type { Span } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { getCurrentScope } from '@sentry/core';
import type { CaptureContext, Client, Event, EventHint, Scope, SeverityLevel } from '@sentry/types';

import type { ExclusiveEventHintOrCaptureContext } from '../utils/prepareEvent';
import { parseEventHintOrCaptureContext } from '../utils/prepareEvent';

/** Get the currently active client. */
export function getClient<C extends Client>(): C {
  const currentScope = getCurrentScope();

  const client = currentScope.getClient();
  if (client) {
    return client as C;
  }

  // TODO otherwise ensure we use a noop client
  return {} as C;
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
