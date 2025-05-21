import type { Client } from './client';
import { getCurrentScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import { getIntegrationsToSetup } from './integration';
import { Integration } from './types-hoist/integration';
import type { ClientOptions, Options } from './types-hoist/options';
import { StackParser } from './types-hoist/stacktrace';
import { BaseTransportOptions, Transport } from './types-hoist/transport';
import { consoleSandbox, logger } from './utils-hoist/logger';
import { stackParserFromStackParserOptions } from './utils-hoist/stacktrace';

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

  const client = new ClientClass(options);
  setCurrentClient(client);
  client.init();
  return client;
}

/** Get client options with defaults. */
export function getClientOptions<
  O extends Options,
  CO extends ClientOptions<TO>,
  TO extends BaseTransportOptions = BaseTransportOptions,
>(
  options: O,
  defaultOptions: {
    stackParser: StackParser;
    integrations: Integration[];
    transport: (transportOptions: TO) => Transport;
  },
): CO {
  return {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultOptions.stackParser),
    integrations: getIntegrationsToSetup(options, defaultOptions.integrations),
    transport: options.transport || defaultOptions.transport,
  } as unknown as CO;
}

/**
 * Make the given client the current client.
 */
export function setCurrentClient(client: Client): void {
  getCurrentScope().setClient(client);
}
