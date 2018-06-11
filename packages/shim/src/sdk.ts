import { Breadcrumb, SentryEvent } from '@sentry/types';
import { getGlobalRegistry } from './global';
import { API_VERSION, Hub } from './hub';
import { Scope } from './interfaces';

/** Default callback used for catching async errors. */
function logError(e?: any): void {
  if (e) {
    console.error(e);
  }
}

/**
 * Internal helper function to call a method on the top client if it exists.
 *
 * @param method The method to call on the client/client.
 * @param args Arguments to pass to the client/fontend.
 */
function invokeClient(method: string, hub?: Hub, ...args: any[]): void {
  const top = getOrCreateHub(hub).getStackTop();
  if (top && top.client && top.client[method]) {
    top.client[method](...args, top.scope);
  }
}

/**
 * Internal helper function to call an async method on the top client if it
 * exists.
 *
 * @param method The method to call on the client/client.
 * @param callback A callback called with the error or success return value.
 * @param args Arguments to pass to the client/fontend.
 */
function invokeClientAsync<T>(
  method: string,
  callback: (error?: any, value?: T) => void,
  hub?: Hub,
  ...args: any[]
): void {
  const top = getOrCreateHub(hub).getStackTop();
  if (top && top.client && top.client[method]) {
    top.client[method](...args, top.scope)
      .then((value: T) => {
        callback(undefined, value);
      })
      .catch((err: any) => {
        callback(err);
      });
  }
}

/**
 * Returns the latest shim instance.
 *
 * If a shim is already registered in the global registry but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered shim will be returned.
 */
function getOrCreateHub(hub?: Hub): Hub {
  const registry = getGlobalRegistry();

  if (!registry.hub || registry.hub.isOlderThan(API_VERSION)) {
    registry.hub = new Hub();
  }

  return hub ? hub : registry.hub;
}

/**
 * Create a new scope to store context information.
 *
 * The scope will be layered on top of the current one. It is isolated, i.e. all
 * breadcrumbs and context information added to this scope will be removed once
 * the scope ends. Be sure to always remove this scope with {@link popScope}
 * when the operation finishes or throws.
 */
export function pushScope(client?: any, hub?: Hub): void {
  getOrCreateHub(hub).pushScope(client);
}

/**
 * Removes a previously pushed scope from the stack.
 *
 * This restores the state before the scope was pushed. All breadcrumbs and
 * context information added since the last call to {@link pushScope} are
 * discarded.
 */
export function popScope(hub?: Hub): void {
  getOrCreateHub(hub).popScope();
}

/**
 * Creates a new scope and executes the given operation within. The scope is
 * automatically removed once the operation finishes or throws.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope();
 *     callback();
 *     popScope();
 *
 * @param callback The operation to execute.
 */
export function withScope(callback: () => void): void;

/**
 * Creates a new scope with a custom client instance and executes the given
 * operation within. The scope is automatically removed once the operation
 * finishes or throws.
 *
 * The client can be configured with different options than the enclosing scope,
 * such as a different DSN or other callbacks.
 *
 * This is essentially a convenience function for:
 *
 *     pushScope(client);
 *     callback();
 *     popScope();
 *
 * @param client A client to use within the scope.
 * @param callback The operation to execute.
 */
export function withScope(client: any, callback: () => void): void;

export function withScope(arg1: any, arg2?: any): void {
  getOrCreateHub().withScope(arg1, arg2);
}

/** Returns the current client, if any. */
export function getCurrentClient(): any | undefined {
  return getOrCreateHub().getCurrentClient();
}

/**
 * This binds the given client to the current scope.
 * @param client An SDK client (client) instance.
 */
export function bindClient(client: any): void {
  const shim = getOrCreateHub();
  const top = shim.getStackTop();
  top.client = client;
  top.scope = shim.createScope(client);
}

/**
 * Captures an exception event and sends it to Sentry.
 *
 * @param exception An exception-like object.
 * @param callback A callback that is invoked when the exception has been sent.
 */
export function captureException(
  exception: any,
  hub?: Hub,
  callback: (error?: any) => void = logError,
): void {
  invokeClientAsync('captureException', callback, hub, exception);
}

/**
 * Captures a message event and sends it to Sentry.
 *
 * @param message The message to send to Sentry.
 * @param callback A callback that is invoked when the message has been sent.
 */
export function captureMessage(
  message: string,
  hub?: Hub,
  callback: (error?: any) => void = logError,
): void {
  invokeClientAsync('captureMessage', callback, hub, message);
}

/**
 * Captures a manually created event and sends it to Sentry.
 *
 * @param event The event to send to Sentry.
 * @param callback A callback that is invoked when the event has been sent.
 */
export function captureEvent(
  event: SentryEvent,
  hub?: Hub,
  callback: (error?: any) => void = logError,
): void {
  invokeClientAsync('captureEvent', callback, hub, event);
}

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 *
 * @param breadcrumb The breadcrumb to record.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb, hub?: Hub): void {
  invokeClient('addBreadcrumb', hub, breadcrumb);
}

/**
 * Callback to set context information onto the scope.
 *
 * @param callback Callback function that receives Scope.
 */
export function configureScope(
  callback: (scope: Scope) => void,
  hub?: Hub,
): void {
  const top = getOrCreateHub(hub).getStackTop();
  if (top.client && top.scope) {
    // TODO: freeze flag
    callback(top.scope);
  }
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
export function _callOnClient(method: string, hub?: Hub, ...args: any[]): void {
  invokeClient(method, hub, ...args);
}
