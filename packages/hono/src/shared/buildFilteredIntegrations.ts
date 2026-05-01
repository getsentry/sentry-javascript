import type { Integration } from '@sentry/core';
import { getIntegrationsToSetup } from '@sentry/core';
import { filterHonoIntegration } from './filterHonoIntegration';

/**
 * Builds an `integrations` callback that removes the default Hono integration
 * to prevent double instrumentation.
 */
export function buildFilteredIntegrations(
  userIntegrations: Integration[] | ((defaults: Integration[]) => Integration[]) | undefined,
  filterUserIntegrations: boolean,
): (defaults: Integration[]) => Integration[] {
  if (Array.isArray(userIntegrations)) {
    const integrations = filterUserIntegrations ? userIntegrations.filter(filterHonoIntegration) : userIntegrations;
    return (defaults: Integration[]) =>
      getIntegrationsToSetup({
        defaultIntegrations: defaults.filter(filterHonoIntegration),
        integrations,
      });
  }

  if (typeof userIntegrations === 'function') {
    return filterUserIntegrations
      ? (defaults: Integration[]) => userIntegrations(defaults).filter(filterHonoIntegration)
      : (defaults: Integration[]) => userIntegrations(defaults.filter(filterHonoIntegration));
  }

  return (defaults: Integration[]) => defaults.filter(filterHonoIntegration);
}
