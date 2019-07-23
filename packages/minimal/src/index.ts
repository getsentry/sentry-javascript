import { getCurrentHub, Hub, Scope } from '@sentry/hub';
import { Breadcrumb, Event, Severity, Span, SpanContext, User } from '@sentry/types';

/**
 * This calls a function on the current hub.
 * @param method function to call on hub.
 * @param args to pass to function.
 */
function callOnHub<T>(method: string, ...args: any[]): T {
  const hub = getCurrentHub();
  if (hub && hub[method as keyof Hub]) {
    // tslint:disable-next-line:no-unsafe-any
    return (hub[method as keyof Hub] as any)(...args);
  }
  throw new Error(`No hub defined or ${method} was not found on the hub, please open a bug report.`);
}

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception An exception-like object.
 * @returns The generated eventId.
 */
export function captureException(exception: any): string {
  let syntheticException: Error;
  try {
    throw new Error('Sentry syntheticException');
  } catch (exception) {
    syntheticException = exception as Error;
  }
  return callOnHub('captureException', exception, {
    originalException: exception,
    syntheticException,
  });
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * @param level Define the level of the message.
 * @returns The generated eventId.
 */
export function captureMessage(message: string, level?: Severity): string {
  let syntheticException: Error;
  try {
    throw new Error(message);
  } catch (exception) {
    syntheticException = exception as Error;
  }
  return callOnHub('captureMessage', message, level, {
    originalException: message,
    syntheticException,
  });
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param event The event to send to Sentry.
 * @returns The generated eventId.
 */
export function captureEvent(event: Event): string {
  return callOnHub('captureEvent', event);
}

/**
 * Callback to set context information onto the scope.
 * @param callback Callback function that receives Scope.
 */
export function configureScope(callback: (scope: Scope) => void): void {
  callOnHub<void>('configureScope', callback);
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param breadcrumb The breadcrumb to record.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  callOnHub<void>('addBreadcrumb', breadcrumb);
}

/**
 * Sets context data with the given name.
 * @param name of the context
 * @param context Any kind of data. This data will be normailzed.
 */
export function setContext(name: string, context: { [key: string]: any } | null): void {
  callOnHub<void>('setContext', name, context);
}

/**
 * Set an object that will be merged sent as extra data with the event.
 * @param extras Extras object to merge into current context.
 */
export function setExtras(extras: { [key: string]: any }): void {
  callOnHub<void>('setExtras', extras);
}

/**
 * Set an object that will be merged sent as tags data with the event.
 * @param tags Tags context object to merge into current context.
 */
export function setTags(tags: { [key: string]: string }): void {
  callOnHub<void>('setTags', tags);
}

/**
 * Set key:value that will be sent as extra data with the event.
 * @param key String of extra
 * @param extra Any kind of data. This data will be normailzed.
 */

export function setExtra(key: string, extra: any): void {
  callOnHub<void>('setExtra', key, extra);
}

/**
 * Set key:value that will be sent as tags data with the event.
 * @param key String key of tag
 * @param value String value of tag
 */
export function setTag(key: string, value: string): void {
  callOnHub<void>('setTag', key, value);
}

/**
 * Updates user context information for future events.
 *
 * @param user User context object to be set in the current context. Pass `null` to unset the user.
 */
export function setUser(user: User | null): void {
  callOnHub<void>('setUser', user);
}

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
 *
 * @param callback that will be enclosed into push/popScope.
 */
export function withScope(callback: (scope: Scope) => void): void {
  callOnHub<void>('withScope', callback);
}

/**
 * Calls a function on the latest client. Use this with caution, it's meant as
 * in "internal" helper so we don't need to expose every possible function in
 * the shim. It is not guaranteed that the client actually implements the
 * function.
 *
 * @param method The method to call on the client/client.
 * @param args Arguments to pass to the client/fontend.
 */
export function _callOnClient(method: string, ...args: any[]): void {
  callOnHub<void>('_invokeClient', method, ...args);
}

/**
 * This functions starts a span. If just a `SpanContext` is passed and there is already a Span
 * on the Scope, the created Span will have a reference to the one on the Scope.
 * If a Span is on the current Scope it is considered a `transaction`.
 * When using the second parameter it will set the created Span on the Scope (replacing whats there).
 * This can be used as a shortcut to not set it manually on the Scope.
 *
 * @param spanContext Properties with which the span should be created
 * @param bindOnScope Determines if the started span will be set on the Scope
 */
export function startSpan(spanContext?: SpanContext, bindOnScope?: boolean): Span {
  return callOnHub<Span>('startSpan', spanContext, bindOnScope);
}

/**
 * This finishes the passed `Span`. If the `Span` has the property `transaction` set and it's bound on the
 * current Scope, an `transaction` Event will be sent to Sentry containing all finished Spans inbetween.
 * Returns either an `event.id` or `undefined` in case event wasn't sent.
 *
 * @param span `Span` instance that was created by {@link startSpan}
 */
export function finishSpan(span: Span): string | undefined {
  return callOnHub<string | undefined>('startSpan', span);
}
