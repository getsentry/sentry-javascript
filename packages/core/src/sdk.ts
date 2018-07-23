import { getDefaultHub } from '@sentry/hub';
import { Integration } from '@sentry/types';
import { Client, Options } from './interfaces';
import { logger } from './logger';

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
  if (getDefaultHub().getClient()) {
    return;
  }

  // TODO: Options.debug? Options.enableLogger?
  logger.enable();

  const client = new clientClass(options);
  client.install();

  // This should happen here if any integration uses {@link Hub.addEventProcessor}
  // there needs to be a client on the hub already.
  getDefaultHub().bindClient(client);

  let integrations = [...defaultIntegrations];
  if (Array.isArray(options.integrations)) {
    integrations = [...integrations, ...options.integrations];
  } else if (typeof options.integrations === 'function') {
    integrations = options.integrations(integrations);
  }

  // Just in case someone will return non-array from a `itegrations` callback
  if (Array.isArray(integrations)) {
    integrations.forEach(integration => {
      integration.install(options);
      logger.log(`Integration installed: ${integration.name}`);
    });
  }
}
