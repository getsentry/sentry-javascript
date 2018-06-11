import { Breadcrumb, SentryEvent } from '@sentry/types';
import { getGlobalCarrier } from './global';
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
  const registry = getGlobalCarrier();

  if (!registry.hub || registry.hub.isOlderThan(API_VERSION)) {
    registry.hub = new Hub();
  }

  return hub ? hub : registry.hub;
}

/**
 * Returns the latest shim instance.
 */
export function getHub(): Hub {
  return getOrCreateHub();
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
  const hub = getOrCreateHub();
  const top = hub.getStackTop();
  top.client = client;
  top.scope = hub.createScope();
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
