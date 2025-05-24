import type { Client } from './client';
import { getCurrentScope } from './currentScopes';
import type { ClientOptions } from './types-hoist/options';
import { enableLogger } from './utils-hoist/logger';

/** A class object that can instantiate Client objects. */
export type ClientClass<F extends Client, O extends ClientOptions> = new (options: O) => F;

/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instantiate.
 * @param options Options to pass to the client.
 */
export function initAndBind<F extends Client, O extends ClientOptions>(ClientClass: ClientClass<F, O>, options: O): F {
  if (options.debug) {
    enableLogger();
  }
  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new ClientClass(options);
  setCurrentClient(client);
  client.init();
  return client;
}

/**
 * Make the given client the current client.
 */
export function setCurrentClient(client: Client): void {
  getCurrentScope().setClient(client);
}
