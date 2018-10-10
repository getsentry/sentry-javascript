import { Integration } from '@sentry/types';
import { Options } from '../interfaces';
import { logger } from '../logger';

export { Dedupe } from './dedupe';
export { FunctionToString } from './functiontostring';
export { SDKInformation } from './sdkinformation';
export { InboundFilters } from './inboundfilters';

export { Debug } from './pluggable/debug';
export { RewriteFrames } from './pluggable/rewriteframes';

const installedIntegrations: string[] = [];

export interface IntegrationIndex {
  [key: string]: Integration;
}

/**
 * Given a list of integration instances this installs them all. When `withDefaults` is set to `true` then all default
 * integrations are added unless they were already provided before.
 * @param integrations array of integration instances
 * @param withDefault should enable default integrations
 */
export function setupIntegrations<O extends Options>(options: O): IntegrationIndex {
  const integrations: IntegrationIndex = {};
  let integrationsToInstall = (options.defaultIntegrations && [...options.defaultIntegrations]) || [];
  if (Array.isArray(options.integrations)) {
    const providedIntegrationsNames = options.integrations.map(i => i.name);
    integrationsToInstall = [
      // Leave only unique integrations, that were not overridden with provided integrations with the same name
      ...integrationsToInstall.filter(integration => providedIntegrationsNames.indexOf(integration.name) === -1),
      ...options.integrations,
    ];
  } else if (typeof options.integrations === 'function') {
    integrationsToInstall = options.integrations(integrationsToInstall);
  }

  // Just in case someone will return non-array from a `itegrations` callback
  if (Array.isArray(integrationsToInstall)) {
    integrationsToInstall.forEach(integration => {
      integrations[name] = integration;
      if (installedIntegrations.indexOf(integration.name) !== -1) {
        return;
      }
      try {
        if (integration.setupOnce) {
          // TODO remove
          integration.setupOnce(options);
        }
      } catch (_Oo) {
        logger.warn(`Integration ${integration.name}: The install method is deprecated. Use "setupOnce".`);
        if (integration.install) {
          // TODO remove if
          integration.install(options);
        }
      }
      installedIntegrations.push(integration.name);
      logger.log(`Integration installed: ${integration.name}`);
    });
  }
  return integrations;
}
