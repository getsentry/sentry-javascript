import type {
  Client,
  Event,
  EventHint,
  EventProcessor,
  Hub,
  Integration,
  IntegrationClass,
  IntegrationFn,
  Options,
} from '@sentry/types';
import { arrayify, logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import { addGlobalEventProcessor } from './eventProcessors';
import { getClient } from './exports';
import { getCurrentHub } from './hub';

declare module '@sentry/types' {
  interface Integration {
    isDefaultInstance?: boolean;
  }
}

export const installedIntegrations: string[] = [];

/** Map of integrations assigned to a client */
export type IntegrationIndex = {
  [key: string]: Integration;
};

/**
 * Remove duplicates from the given array, preferring the last instance of any duplicate. Not guaranteed to
 * preseve the order of integrations in the array.
 *
 * @private
 */
function filterDuplicates(integrations: Integration[]): Integration[] {
  const integrationsByName: { [key: string]: Integration } = {};

  integrations.forEach(currentInstance => {
    const { name } = currentInstance;

    const existingInstance = integrationsByName[name];

    // We want integrations later in the array to overwrite earlier ones of the same type, except that we never want a
    // default instance to overwrite an existing user instance
    if (existingInstance && !existingInstance.isDefaultInstance && currentInstance.isDefaultInstance) {
      return;
    }

    integrationsByName[name] = currentInstance;
  });

  return Object.keys(integrationsByName).map(k => integrationsByName[k]);
}

/** Gets integrations to install */
export function getIntegrationsToSetup(options: Pick<Options, 'defaultIntegrations' | 'integrations'>): Integration[] {
  const defaultIntegrations = options.defaultIntegrations || [];
  const userIntegrations = options.integrations;

  // We flag default instances, so that later we can tell them apart from any user-created instances of the same class
  defaultIntegrations.forEach(integration => {
    integration.isDefaultInstance = true;
  });

  let integrations: Integration[];

  if (Array.isArray(userIntegrations)) {
    integrations = [...defaultIntegrations, ...userIntegrations];
  } else if (typeof userIntegrations === 'function') {
    integrations = arrayify(userIntegrations(defaultIntegrations));
  } else {
    integrations = defaultIntegrations;
  }

  const finalIntegrations = filterDuplicates(integrations);

  // The `Debug` integration prints copies of the `event` and `hint` which will be passed to `beforeSend` or
  // `beforeSendTransaction`. It therefore has to run after all other integrations, so that the changes of all event
  // processors will be reflected in the printed values. For lack of a more elegant way to guarantee that, we therefore
  // locate it and, assuming it exists, pop it out of its current spot and shove it onto the end of the array.
  const debugIndex = findIndex(finalIntegrations, integration => integration.name === 'Debug');
  if (debugIndex !== -1) {
    const [debugInstance] = finalIntegrations.splice(debugIndex, 1);
    finalIntegrations.push(debugInstance);
  }

  return finalIntegrations;
}

/**
 * Given a list of integration instances this installs them all. When `withDefaults` is set to `true` then all default
 * integrations are added unless they were already provided before.
 * @param integrations array of integration instances
 * @param withDefault should enable default integrations
 */
export function setupIntegrations(client: Client, integrations: Integration[]): IntegrationIndex {
  const integrationIndex: IntegrationIndex = {};

  integrations.forEach(integration => {
    // guard against empty provided integrations
    if (integration) {
      setupIntegration(client, integration, integrationIndex);
    }
  });

  return integrationIndex;
}

/** Setup a single integration.  */
export function setupIntegration(client: Client, integration: Integration, integrationIndex: IntegrationIndex): void {
  integrationIndex[integration.name] = integration;

  // `setupOnce` is only called the first time
  if (installedIntegrations.indexOf(integration.name) === -1) {
    // eslint-disable-next-line deprecation/deprecation
    integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
    installedIntegrations.push(integration.name);
  }

  // `setup` is run for each client
  if (integration.setup && typeof integration.setup === 'function') {
    integration.setup(client);
  }

  if (client.on && typeof integration.preprocessEvent === 'function') {
    const callback = integration.preprocessEvent.bind(integration) as typeof integration.preprocessEvent;
    client.on('preprocessEvent', (event, hint) => callback(event, hint, client));
  }

  if (client.addEventProcessor && typeof integration.processEvent === 'function') {
    const callback = integration.processEvent.bind(integration) as typeof integration.processEvent;

    const processor = Object.assign((event: Event, hint: EventHint) => callback(event, hint, client), {
      id: integration.name,
    });

    client.addEventProcessor(processor);
  }

  DEBUG_BUILD && logger.log(`Integration installed: ${integration.name}`);
}

/** Add an integration to the current hub's client. */
export function addIntegration(integration: Integration): void {
  const client = getClient();

  if (!client || !client.addIntegration) {
    DEBUG_BUILD && logger.warn(`Cannot add integration "${integration.name}" because no SDK Client is available.`);
    return;
  }

  client.addIntegration(integration);
}

// Polyfill for Array.findIndex(), which is not supported in ES5
function findIndex<T>(arr: T[], callback: (item: T) => boolean): number {
  for (let i = 0; i < arr.length; i++) {
    if (callback(arr[i]) === true) {
      return i;
    }
  }

  return -1;
}

/**
 * Convert a new integration function to the legacy class syntax.
 * In v8, we can remove this and instead export the integration functions directly.
 *
 * @deprecated This will be removed in v8!
 */
export function convertIntegrationFnToClass<Fn extends IntegrationFn>(
  name: string,
  fn: Fn,
): IntegrationClass<
  Integration &
    ReturnType<Fn> & {
      setupOnce: (addGlobalEventProcessor?: (callback: EventProcessor) => void, getCurrentHub?: () => Hub) => void;
    }
> {
  return Object.assign(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function ConvertedIntegration(...rest: any[]) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        setupOnce: () => {},
        ...fn(...rest),
      };
    },
    { id: name },
  ) as unknown as IntegrationClass<
    Integration &
      ReturnType<Fn> & {
        setupOnce: (addGlobalEventProcessor?: (callback: EventProcessor) => void, getCurrentHub?: () => Hub) => void;
      }
  >;
}
