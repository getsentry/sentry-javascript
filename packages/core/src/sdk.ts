import {
  bindClient as shimBindClient,
  getCurrentClient as shimGetCurrentClient,
} from '@sentry/shim';
import { Client, Options } from './interfaces';

export {
  captureException,
  captureMessage,
  clearScope,
  configureScope,
  popScope,
  pushScope,
} from '@sentry/shim';

/** A class object that can instanciate Client objects. */
export interface ClientClass<F extends Client, O extends Options> {
  new (options: O): F;
}

/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instanciate.
 * @param options Options to pass to the client.
 * @returns The installed and bound client instance.
 */
export function initAndBind<F extends Client, O extends Options>(
  clientClass: ClientClass<F, O>,
  options: O,
): void {
  if (shimGetCurrentClient()) {
    return;
  }

  const client = new clientClass(options);
  client.install();
  shimBindClient(client);
}
