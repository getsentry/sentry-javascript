import { Client, ClientOptions, Hub } from '@sentry/types';
import { logger } from '@sentry/utils';

/** A class object that can instantiate Client objects. */
export type ClientClass<F extends Client, O extends ClientOptions> = new (options: O) => F;

/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param hub
 * @param clientClass The client class to instantiate.
 * @param options Options to pass to the client.
 */
export function initAndBind<F extends Client, O extends ClientOptions>(
  hub: Hub,
  clientClass: ClientClass<F, O>,
  options: O,
): void {
  if (options.debug === true) {
    if (__DEBUG_BUILD__) {
      logger.enable();
    } else {
      // use `console.warn` rather than `logger.warn` since by non-debug bundles have all `logger.x` statements stripped
      // eslint-disable-next-line no-console
      console.warn('[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.');
    }
  }

  // @ts-ignore this is where things dont work, the Hub interface is missing `getStope`
  const scope = hub.getScope();
  if (scope) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    scope.update(options.initialScope);
  }

  const client = new clientClass(options);
  hub.bindClient(client);
  client.setupIntegrations(hub);
}
