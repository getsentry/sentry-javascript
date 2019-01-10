import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils/logger';
import { Options } from './interfaces';

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
    const pickedIntegrationsNames = [];

    // Leave only unique default integrations, that were not overridden with provided user integrations
    for (const defaultIntegration of defaultIntegrations) {
      if (
        userIntegrationsNames.indexOf(getIntegrationName(defaultIntegration)) === -1 &&
        pickedIntegrationsNames.indexOf(getIntegrationName(defaultIntegration)) === -1
      ) {
        integrations.push(defaultIntegration);
        pickedIntegrationsNames.push(getIntegrationName(defaultIntegration));
      }
    }

    // Don't add same user integration twice
    for (const userIntegration of userIntegrations) {
      if (pickedIntegrationsNames.indexOf(getIntegrationName(userIntegration)) === -1) {
        integrations.push(userIntegration);
        pickedIntegrationsNames.push(getIntegrationName(userIntegration));
      }
    }
  } else if (typeof userIntegrations === 'function') {
    integrations = userIntegrations(defaultIntegrations);
    integrations = Array.isArray(integrations) ? integrations : [integrations];
  } else {
    return [...defaultIntegrations];
  }

  return integrations;
}

/** Setup given integration */
export function setupIntegration(integration: Integration, options: Options): void {
  if (installedIntegrations.indexOf(getIntegrationName(integration)) !== -1) {
    return;
  }

  try {
    integration.setupOnce();
  } catch (_Oo) {
    /** @deprecated */
    // TODO: Remove in v5

    // tslint:disable:deprecation
    if (integration.install) {
      logger.warn(`Integration ${getIntegrationName(integration)}: The install method is deprecated. Use "setupOnce".`);
      integration.install(options);
    }
    // tslint:enable:deprecation
  }

  installedIntegrations.push(getIntegrationName(integration));
  logger.log(`Integration installed: ${getIntegrationName(integration)}`);
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
    integrations[getIntegrationName(integration)] = integration;
    setupIntegration(integration, options);
  });
  return integrations;
}

/**
 * Returns the integration static id.
 * @param integration Integration to retrieve id
 */
function getIntegrationName(integration: Integration): string {
  /**
   * @depracted
   */
  // tslint:disable-next-line:no-unsafe-any
  return (integration as any).constructor.id || integration.name;
}
