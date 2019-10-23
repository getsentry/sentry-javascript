import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Integration, Options } from '@sentry/types';
import { logger } from '@sentry/utils';

export const installedIntegrations: string[] = [];

/** Map of integrations assigned to a client */
export interface IntegrationIndex {
  [key: string]: Integration;
}

/** Gets integration to install */
export function getIntegrationsToSetup(options: Options): Integration[] {
  const defaultIntegrations = (options.defaultIntegrations && [...options.defaultIntegrations]) || [];
  const userIntegrations = options.integrations;
  let integrations: Integration[] = [];
  if (Array.isArray(userIntegrations)) {
    const userIntegrationsNames = userIntegrations.map(i => i.name);
    const pickedIntegrationsNames: string[] = [];

    // Leave only unique default integrations, that were not overridden with provided user integrations
    defaultIntegrations.forEach(defaultIntegration => {
      if (
        userIntegrationsNames.indexOf(defaultIntegration.name) === -1 &&
        pickedIntegrationsNames.indexOf(defaultIntegration.name) === -1
      ) {
        integrations.push(defaultIntegration);
        pickedIntegrationsNames.push(defaultIntegration.name);
      }
    });

    // Don't add same user integration twice
    userIntegrations.forEach(userIntegration => {
      if (pickedIntegrationsNames.indexOf(userIntegration.name) === -1) {
        integrations.push(userIntegration);
        pickedIntegrationsNames.push(userIntegration.name);
      }
    });
  } else if (typeof userIntegrations === 'function') {
    integrations = userIntegrations(defaultIntegrations);
    integrations = Array.isArray(integrations) ? integrations : [integrations];
  } else {
    integrations = [...defaultIntegrations];
  }

  // Make sure that if present, `Debug` integration will always run last
  const integrationsNames = integrations.map(i => i.name);
  const alwaysLastToRun = 'Debug';
  if (integrationsNames.indexOf(alwaysLastToRun) !== -1) {
    integrations.push(...integrations.splice(integrationsNames.indexOf(alwaysLastToRun), 1));
  }

  return integrations;
}

/** Setup given integration */
export function setupIntegration(integration: Integration): void {
  if (installedIntegrations.indexOf(integration.name) !== -1) {
    return;
  }
  integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
  installedIntegrations.push(integration.name);
  logger.log(`Integration installed: ${integration.name}`);
}

/**
 * Given a list of integration instances this installs them all. When `withDefaults` is set to `true` then all default
 * integrations are added unless they were already provided before.
 * @param integrations array of integration instances
 * @param withDefault should enable default integrations
 */
export function setupIntegrations<O extends Options>(options: O): IntegrationIndex {
  const integrations: IntegrationIndex = {};
  getIntegrationsToSetup(options).forEach(integration => {
    integrations[integration.name] = integration;
    setupIntegration(integration);
  });
  return integrations;
}
