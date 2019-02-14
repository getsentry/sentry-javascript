import { getCurrentHub } from '@sentry/hub';
import { logger } from '@sentry/utils/logger';
import { Client, Options } from './interfaces';

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
export function initAndBind<F extends Client, O extends Options>(clientClass: ClientClass<F, O>, options: O): void {
  if (options.debug === true) {
    logger.enable();
  }

  const client = new clientClass(options);
  getCurrentHub().bindClient(client);
  client.install();
}
