import type { Client } from './client';
import { getClient } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { Event, EventHint } from './types-hoist/event';
import type { Integration, IntegrationFn } from './types-hoist/integration';
import type { CoreOptions } from './types-hoist/options';
import { debug } from './utils/debug-logger';

export const installedIntegrations: string[] = [];

/**
 * Registry to track integrations marked as disabled.
 * This is used to prevent duplicate instrumentation when higher-level integrations
 * (like LangChain) already instrument the underlying libraries (like OpenAI, Anthropic, etc.)
 */
const MARKED_DISABLED_INTEGRATIONS = new Set<string>();

/**
 * Mark one or more integrations as disabled to prevent their instrumentation from being set up.
 * This should be called during an integration's setupOnce() phase.
 * The marked integrations will be skipped when their own setupOnce() is called.
 *
 * @internal This is an internal API for coordination between integrations, not for public use.
 * @param integrationName The name(s) of the integration(s) to mark as disabled
 */
export function _markIntegrationsDisabled(integrationName: string | string[]): void {
  if (Array.isArray(integrationName)) {
    integrationName.forEach(name => MARKED_DISABLED_INTEGRATIONS.add(name));
  } else {
    MARKED_DISABLED_INTEGRATIONS.add(integrationName);
  }
}

/**
 * Check if an integration has been marked as disabled.
 *
 * @internal This is an internal API for coordination between integrations, not for public use.
 * @param integrationName The name of the integration to check
 * @returns true if the integration is marked as disabled
 */
export function _isIntegrationMarkedDisabled(integrationName: string): boolean {
  return MARKED_DISABLED_INTEGRATIONS.has(integrationName);
}

/**
 * Clear all integration marks and remove marked integrations from the installed list.
 * This is automatically called at the start of Sentry.init() to ensure a clean state
 * between different client initializations.
 *
 * This also removes the marked integrations from the global installedIntegrations list,
 * allowing them to run setupOnce() again if they're included in a new client.
 *
 * @internal This is an internal API for coordination between integrations, not for public use.
 */
export function _clearDisabledIntegrationsMarks(): void {
  // Remove marked integrations from the installed list so they can setup again
  const filtered = installedIntegrations.filter(integration => !MARKED_DISABLED_INTEGRATIONS.has(integration));
  installedIntegrations.splice(0, installedIntegrations.length, ...filtered);

  MARKED_DISABLED_INTEGRATIONS.clear();
}

/** Map of integrations assigned to a client */
export type IntegrationIndex = {
  [key: string]: Integration;
};

type IntegrationWithDefaultInstance = Integration & { isDefaultInstance?: true };

/**
 * Remove duplicates from the given array, preferring the last instance of any duplicate. Not guaranteed to
 * preserve the order of integrations in the array.
 *
 * @private
 */
function filterDuplicates(integrations: Integration[]): Integration[] {
  const integrationsByName: { [key: string]: Integration } = {};

  integrations.forEach((currentInstance: IntegrationWithDefaultInstance) => {
    const { name } = currentInstance;

    const existingInstance: IntegrationWithDefaultInstance | undefined = integrationsByName[name];

    // We want integrations later in the array to overwrite earlier ones of the same type, except that we never want a
    // default instance to overwrite an existing user instance
    if (existingInstance && !existingInstance.isDefaultInstance && currentInstance.isDefaultInstance) {
      return;
    }

    integrationsByName[name] = currentInstance;
  });

  return Object.values(integrationsByName);
}

/** Gets integrations to install */
export function getIntegrationsToSetup(
  options: Pick<CoreOptions, 'defaultIntegrations' | 'integrations'>,
): Integration[] {
  const defaultIntegrations = options.defaultIntegrations || [];
  const userIntegrations = options.integrations;

  // We flag default instances, so that later we can tell them apart from any user-created instances of the same class
  defaultIntegrations.forEach((integration: IntegrationWithDefaultInstance) => {
    integration.isDefaultInstance = true;
  });

  let integrations: Integration[];

  if (Array.isArray(userIntegrations)) {
    integrations = [...defaultIntegrations, ...userIntegrations];
  } else if (typeof userIntegrations === 'function') {
    const resolvedUserIntegrations = userIntegrations(defaultIntegrations);
    integrations = Array.isArray(resolvedUserIntegrations) ? resolvedUserIntegrations : [resolvedUserIntegrations];
  } else {
    integrations = defaultIntegrations;
  }

  return filterDuplicates(integrations);
}

/**
 * Given a list of integration instances this installs them all. When `withDefaults` is set to `true` then all default
 * integrations are added unless they were already provided before.
 * @param integrations array of integration instances
 * @param withDefault should enable default integrations
 */
export function setupIntegrations(client: Client, integrations: Integration[]): IntegrationIndex {
  const integrationIndex: IntegrationIndex = {};

  integrations.forEach((integration: Integration | undefined) => {
    // guard against empty provided integrations
    if (integration) {
      setupIntegration(client, integration, integrationIndex);
    }
  });

  return integrationIndex;
}

/**
 * Execute the `afterAllSetup` hooks of the given integrations.
 */
export function afterSetupIntegrations(client: Client, integrations: Integration[]): void {
  for (const integration of integrations) {
    // guard against empty provided integrations
    if (integration?.afterAllSetup) {
      integration.afterAllSetup(client);
    }
  }
}

/** Setup a single integration.  */
export function setupIntegration(client: Client, integration: Integration, integrationIndex: IntegrationIndex): void {
  if (integrationIndex[integration.name]) {
    DEBUG_BUILD && debug.log(`Integration skipped because it was already installed: ${integration.name}`);
    return;
  }
  integrationIndex[integration.name] = integration;

  // `setupOnce` is only called the first time
  if (!installedIntegrations.includes(integration.name) && typeof integration.setupOnce === 'function') {
    // Skip setup if integration is marked as disabled
    if (!_isIntegrationMarkedDisabled(integration.name)) {
      integration.setupOnce();
      installedIntegrations.push(integration.name);
    }
  }

  // `setup` is run for each client
  if (integration.setup && typeof integration.setup === 'function') {
    integration.setup(client);
  }

  if (typeof integration.preprocessEvent === 'function') {
    const callback = integration.preprocessEvent.bind(integration) as typeof integration.preprocessEvent;
    client.on('preprocessEvent', (event, hint) => callback(event, hint, client));
  }

  if (typeof integration.processEvent === 'function') {
    const callback = integration.processEvent.bind(integration) as typeof integration.processEvent;

    const processor = Object.assign((event: Event, hint: EventHint) => callback(event, hint, client), {
      id: integration.name,
    });

    client.addEventProcessor(processor);
  }

  DEBUG_BUILD && debug.log(`Integration installed: ${integration.name}`);
}

/** Add an integration to the current scope's client. */
export function addIntegration(integration: Integration): void {
  const client = getClient();

  if (!client) {
    DEBUG_BUILD && debug.warn(`Cannot add integration "${integration.name}" because no SDK Client is available.`);
    return;
  }

  client.addIntegration(integration);
}

/**
 * Define an integration function that can be used to create an integration instance.
 * Note that this by design hides the implementation details of the integration, as they are considered internal.
 */
export function defineIntegration<Fn extends IntegrationFn>(fn: Fn): (...args: Parameters<Fn>) => Integration {
  return fn;
}
