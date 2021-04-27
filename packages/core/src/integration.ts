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
  const defaultIntegrations = options._internal?.defaultIntegrations || [];
  const discoveredIntegrations = options._internal?.discoveredIntegrations || [];
  const userIntegrations = options.integrations || [];

  // Filter out default integrations that are also discovered
  let integrations: Integration[] = [
    ...defaultIntegrations.filter(defaultIntegration =>
      discoveredIntegrations.every(discoveredIntegration => discoveredIntegration.name !== defaultIntegration.name),
    ),
    ...discoveredIntegrations,
  ];

  if (Array.isArray(userIntegrations)) {
    // Filter out integrations that are also included in user options
    integrations = [
      ...integrations.filter(integrations =>
        userIntegrations.every(userIntegration => userIntegration.name !== integrations.name),
      ),
      // And filter out duplicated user options integrations
      ...userIntegrations.reduce((acc, userIntegration) => {
        if (acc.every(accIntegration => userIntegration.name !== accIntegration.name)) {
          acc.push(userIntegration);
        }
        return acc;
      }, [] as Integration[]),
    ];
  } else if (typeof userIntegrations === 'function') {
    integrations = userIntegrations(integrations);
    integrations = Array.isArray(integrations) ? integrations : [integrations];
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
export function setupIntegrations(options: Options): IntegrationIndex {
  const integrations: IntegrationIndex = {};
  getIntegrationsToSetup(options).forEach(integration => {
    integrations[integration.name] = integration;
    setupIntegration(integration);
  });
  return integrations;
}
