import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { ClientOptions, Integration, Options } from '@sentry/types';
import { addNonEnumerableProperty, logger } from '@sentry/utils';

import { IS_DEBUG_BUILD } from './flags';

export const installedIntegrations: string[] = [];

/** Map of integrations assigned to a client */
export type IntegrationIndex = {
  [key: string]: Integration;
} & { initialized?: boolean };

/**
 * @private
 */
function filterDuplicates(integrations: Integration[]): Integration[] {
  return integrations.reduce((acc, integrations) => {
    if (acc.every(accIntegration => integrations.name !== accIntegration.name)) {
      acc.push(integrations);
    }
    return acc;
  }, [] as Integration[]);
}

/** Gets integration to install */
export function getIntegrationsToSetup(options: Options): Integration[] {
  const defaultIntegrations = (options.defaultIntegrations && [...options.defaultIntegrations]) || [];
  const userIntegrations = options.integrations;

  let integrations: Integration[] = [...filterDuplicates(defaultIntegrations)];

  if (Array.isArray(userIntegrations)) {
    // Filter out integrations that are also included in user options
    integrations = [
      ...integrations.filter(integrations =>
        userIntegrations.every(userIntegration => userIntegration.name !== integrations.name),
      ),
      // And filter out duplicated user options integrations
      ...filterDuplicates(userIntegrations),
    ];
  } else if (typeof userIntegrations === 'function') {
    integrations = userIntegrations(integrations);
    integrations = Array.isArray(integrations) ? integrations : [integrations];
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
  IS_DEBUG_BUILD && logger.log(`Integration installed: ${integration.name}`);
}

/**
 * Given a list of integration instances this installs them all. When `withDefaults` is set to `true` then all default
 * integrations are added unless they were already provided before.
 * @param integrations array of integration instances
 * @param withDefault should enable default integrations
 */
export function setupIntegrations<O extends ClientOptions>(options: O): IntegrationIndex {
  const integrations: IntegrationIndex = {};
  options.integrations.forEach(integration => {
    integrations[integration.name] = integration;
    setupIntegration(integration);
  });
  // set the `initialized` flag so we don't run through the process again unecessarily; use `Object.defineProperty`
  // because by default it creates a property which is nonenumerable, which we want since `initialized` shouldn't be
  // considered a member of the index the way the actual integrations are
  addNonEnumerableProperty(integrations, 'initialized', true);
  return integrations;
}
