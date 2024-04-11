import type { Client, ClientOptions, Hub as HubInterface } from '@sentry/types';
import { consoleSandbox, logger } from '@sentry/utils';
import { getCurrentScope } from './currentScopes';

import { DEBUG_BUILD } from './debug-build';
import type { Hub } from './hub';
import { getCurrentHub } from './hub';

/** A class object that can instantiate Client objects. */
export type ClientClass<F extends Client, O extends ClientOptions> = new (options: O) => F;

/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instantiate.
 * @param options Options to pass to the client.
 */
export function initAndBind<F extends Client, O extends ClientOptions>(
  clientClass: ClientClass<F, O>,
  options: O,
): void {
  if (options.debug === true) {
    if (DEBUG_BUILD) {
      logger.enable();
    } else {
      // use `console.warn` rather than `logger.warn` since by non-debug bundles have all `logger.x` statements stripped
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.');
      });
    }
  }
  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new clientClass(options);
  setCurrentClient(client);
  client.init();
}

/**
 * Make the given client the current client.
 */
export function setCurrentClient(client: Client): void {
  getCurrentScope().setClient(client);

  // is there a hub too?
  // eslint-disable-next-line deprecation/deprecation
  const hub = getCurrentHub();
  if (isHubClass(hub)) {
    // eslint-disable-next-line deprecation/deprecation
    const top = hub.getStackTop();
    top.client = client;
  }
}

// eslint-disable-next-line deprecation/deprecation
function isHubClass(hub: HubInterface): hub is Hub {
  // eslint-disable-next-line deprecation/deprecation
  return !!(hub as Hub).getStackTop;
}
