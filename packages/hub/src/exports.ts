import {
  Breadcrumb,
  CaptureContext,
  CustomSamplingContext,
  Event,
  EventHint,
  Extra,
  Extras,
  Primitive,
  Severity,
  SeverityLevel,
  TransactionContext,
  User,
} from '@sentry/types';

import { Hub } from './hub';
import { Scope } from './scope';

// Note: All functions in this file are typed with a return value of `ReturnType<Hub[HUB_FUNCTION]>`,
// where HUB_FUNCTION is some method on the Hub class.
//
// This is done to make sure the top level SDK methods stay in sync with the hub methods.
// Although every method here has an explicit return type, some of them (that map to void returns) do not
// contain `return` keywords. This is done to save on bundle size, as `return` is not minifiable.

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param hub The Hub instance.
 * @param exception An exception-like object.
 * @param captureContext Additional scope data to apply to exception event.
 * @returns The generated eventId.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function captureException(hub: Hub, exception: any, captureContext?: CaptureContext): ReturnType<Hub['captureException']> {
  return hub.captureException(exception, { captureContext });
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param hub The Hub instance.
 * @param message The message to send to Sentry.
 * @param captureContext
 * @returns The generated eventId.
 */
export function captureMessage(
  hub: Hub,
  message: string,
  // eslint-disable-next-line deprecation/deprecation
  captureContext?: CaptureContext | Severity | SeverityLevel,
): ReturnType<Hub['captureMessage']> {
  // This is necessary to provide explicit scopes upgrade, without changing the original
  // arity of the `captureMessage(message, level)` method.
  const level = typeof captureContext === 'string' ? captureContext : undefined;
  const context = typeof captureContext !== 'string' ? { captureContext } : undefined;
  return hub.captureMessage(message, level, context);
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param hub The Hub instance.
 * @param event The event to send to Sentry.
 * @param hint The Event Hint.
 * @returns The generated eventId.
 */
export function captureEvent(hub: Hub, event: Event, hint?: EventHint): ReturnType<Hub['captureEvent']> {
  return hub.captureEvent(event, hint);
}

/**
 * Callback to set context information onto the scope.
 * @param hub The Hub instance.
 * @param callback Callback function that receives Scope.
 */
export function configureScope(hub: Hub, callback: (scope: Scope) => void): ReturnType<Hub['configureScope']> {
  hub.configureScope(callback);
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param breadcrumb The breadcrumb to record.
 */
export function addBreadcrumb(hub: Hub, breadcrumb: Breadcrumb): ReturnType<Hub['addBreadcrumb']> {
  hub.addBreadcrumb(breadcrumb);
}

/**
 * Sets context data with the given name.
 * @param name of the context
 * @param context Any kind of data. This data will be normalized.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setContext(hub: Hub, name: string, context: { [key: string]: any } | null): ReturnType<Hub['setContext']> {
  hub.setContext(name, context);
}

/**
 * Set an object that will be merged sent as extra data with the event.
 * @param extras Extras object to merge into current context.
 */
export function setExtras(hub: Hub, extras: Extras): ReturnType<Hub['setExtras']> {
  hub.setExtras(extras);
}

/**
 * Set key:value that will be sent as extra data with the event.
 * @param key String of extra
 * @param extra Any kind of data. This data will be normalized.
 */
export function setExtra(hub: Hub, key: string, extra: Extra): ReturnType<Hub['setExtra']> {
  hub.setExtra(key, extra);
}

/**
 * Set an object that will be merged sent as tags data with the event.
 * @param tags Tags context object to merge into current context.
 */
export function setTags(hub: Hub, tags: { [key: string]: Primitive }): ReturnType<Hub['setTags']> {
  hub.setTags(tags);
}

/**
 * Set key:value that will be sent as tags data with the event.
 *
 * Can also be used to unset a tag, by passing `undefined`.
 *
 * @param key String key of tag
 * @param value Value of tag
 */
export function setTag(hub: Hub, key: string, value: Primitive): ReturnType<Hub['setTag']> {
  hub.setTag(key, value);
}

/**
 * Updates user context information for future events.
 *
 * @param user User context object to be set in the current context. Pass `null` to unset the user.
 */
export function setUser(hub: Hub, user: User | null): ReturnType<Hub['setUser']> {
  hub.setUser(user);
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
export function withScope(hub: Hub, callback: (scope: Scope) => void): ReturnType<Hub['withScope']> {
  hub.withScope(callback);
}

/**
 * Starts a new `Transaction` and returns it. This is the entry point to manual tracing instrumentation.
 *
 * A tree structure can be built by adding child spans to the transaction, and child spans to other spans. To start a
 * new child span within the transaction or any span, call the respective `.startChild()` method.
 *
 * Every child span must be finished before the transaction is finished, otherwise the unfinished spans are discarded.
 *
 * The transaction must be finished with a call to its `.finish()` method, at which point the transaction with all its
 * finished child spans will be sent to Sentry.
 *
 * NOTE: This function should only be used for *manual* instrumentation. Auto-instrumentation should call
 * `startTransaction` directly on the hub.
 *
 * @param context Properties of the new `Transaction`.
 * @param customSamplingContext Information given to the transaction sampling function (along with context-dependent
 * default values). See {@link Options.tracesSampler}.
 *
 * @returns The transaction which was just started
 */
export function startTransaction(
  hub: Hub,
  context: TransactionContext,
  customSamplingContext?: CustomSamplingContext,
): ReturnType<Hub['startTransaction']> {
  return hub.startTransaction(
    {
      metadata: { source: 'custom' },
      ...context,
    },
    customSamplingContext,
  );
}
