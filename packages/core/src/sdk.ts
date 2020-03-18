import { getCurrentHub } from '@sentry/hub';
import { Client, Options } from '@sentry/types';
import { logger } from '@sentry/utils';

/** A class object that can instanciate Client objects. */
export type ClientClass<F extends Client, O extends Options> = new (options: O) => F;

/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instanciate.
 * @param options Options to pass to the client.
 */
export function initAndBind<F extends Client, O extends Options>(clientClass: ClientClass<F, O>, options: O): void {
  if (options.debug === true) {
    logger.enable();
  }
  const hub = getCurrentHub();
  const client = new clientClass(options);
  hub.bindClient(client);
}
