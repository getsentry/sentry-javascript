import { getDefaultHub, Hub, Scope } from '@sentry/hub';
import { Breadcrumb, SentryEvent } from '@sentry/types';

/**
 * This calls a function on the current hub.
 * @param method function to call on hub.
 * @param args to pass to function.
 */
function callOnHub(method: string, ...args: any[]): void {
  const hub = getDefaultHub();
  if (hub && hub[method as keyof Hub]) {
    (hub[method as keyof Hub] as any)(...args);
  }
}

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception An exception-like object.
 */
export function captureException(exception: any): void {
  let syntheticException: Error;
  try {
    // TODO: Get message from captureException call in case we pass it a non-Error type?
    throw new Error('Sentry syntheticException');
  } catch (exception) {
    syntheticException = exception as Error;
  }
  callOnHub('captureException', exception, syntheticException);
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 */
export function captureMessage(message: string): void {
  let syntheticException: Error;
  try {
    throw new Error(message);
  } catch (exception) {
    syntheticException = exception as Error;
  }
  callOnHub('captureMessage', message, syntheticException);
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param event The event to send to Sentry.
 */
export function captureEvent(event: SentryEvent): void {
  callOnHub('captureEvent', event);
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
  callOnHub('addBreadcrumb', breadcrumb);
}

/**
 * Callback to set context information onto the scope.
 * @param callback Callback function that receives Scope.
 */
export function configureScope(callback: (scope: Scope) => void): void {
  callOnHub('configureScope', callback);
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
  callOnHub('invokeClient', method, ...args);
}
