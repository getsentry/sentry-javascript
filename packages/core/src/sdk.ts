import {
  bindClient as shimBindClient,
  getCurrentClient as shimGetCurrentClient,
} from '@sentry/shim';
import { Integration } from '@sentry/types';
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
export function initAndBind<F extends Client, O extends Options>(
  clientClass: ClientClass<F, O>,
  options: O,
  defaultIntegrations: Integration[] = [],
): void {
  if (shimGetCurrentClient()) {
    return;
  }

  const client = new clientClass(options);
  client.install();

  let integrations = [...defaultIntegrations];
  if (Array.isArray(options.integrations)) {
    integrations = [...integrations, ...options.integrations];
  } else if (typeof options.integrations === 'function') {
    integrations = options.integrations(integrations);
  }

  // Just in case someone will return non-array from a `itegrations` callback
  if (Array.isArray(integrations)) {
    integrations.forEach(integration => {
      // Safety first
      if (integration && typeof integration.install === 'function') {
        integration.install();
      }
    });
  }

  shimBindClient(client);
}
