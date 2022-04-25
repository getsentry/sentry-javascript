import { Breadcrumb, CaptureContext, Event, Severity, SeverityLevel } from '@sentry/types';

import { getCurrentHub, Hub } from './hub';
import { Scope } from './scope';

/**
 * This calls a function on the current hub.
 * @param method function to call on hub.
 * @param args to pass to function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callOnHub<T>(method: string, ...args: any[]): T {
  const hub = getCurrentHub();
  if (hub && hub[method as keyof Hub]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export function captureException(exception: any, captureContext?: CaptureContext): ReturnType<Hub['captureException']> {
  return getCurrentHub().captureException(exception, { captureContext });
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * @param Severity Define the level of the message.
 * @returns The generated eventId.
 */
export function captureMessage(
  message: string,
  // eslint-disable-next-line deprecation/deprecation
  captureContext?: CaptureContext | Severity | SeverityLevel,
): ReturnType<Hub['captureMessage']> {
  // This is necessary to provide explicit scopes upgrade, without changing the original
  // arity of the `captureMessage(message, level)` method.
  const level = typeof captureContext === 'string' ? captureContext : undefined;
  const context = typeof captureContext !== 'string' ? { captureContext } : undefined;
  return getCurrentHub().captureMessage(message, level, context);
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param event The event to send to Sentry.
 * @returns The generated eventId.
 */
export function captureEvent(event: Event): ReturnType<Hub['captureEvent']> {
  return getCurrentHub().captureEvent(event);
}

/**
 * Callback to set context information onto the scope.
 * @param callback Callback function that receives Scope.
 */
export function configureScope(callback: (scope: Scope) => void): ReturnType<Hub['configureScope']> {
  return getCurrentHub().configureScope(callback);
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param breadcrumb The breadcrumb to record.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb): ReturnType<Hub['addBreadcrumb']> {
  return getCurrentHub().addBreadcrumb(breadcrumb);
}

/**
 * Sets context data with the given name.
 * @param name of the context
 * @param context Any kind of data. This data will be normalized.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setContext(name: string, context: { [key: string]: any } | null): ReturnType<Hub['setContext']> {
  return getCurrentHub().setContext(name, context);
}
