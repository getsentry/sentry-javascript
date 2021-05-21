import { Integration } from '@sentry/types';

export type UserFunctionIntegrations = (integrations: Integration[]) => Integration[];
export type UserIntegrations = Integration[] | UserFunctionIntegrations;

/**
 * Retrieves the patched integrations with the provided integration.
 *
 * The integration must be present in the final user integrations, and they are compared
 * by integration name. If the user has defined one, there's nothing to patch; if not,
 * the provided integration is added.
 *
 * @param integration The integration to patch, if necessary.
 * @param userIntegrations Integrations defined by the user.
 * @returns Final integrations, patched if necessary.
 */
export function addIntegration(integration: Integration, userIntegrations: UserIntegrations): UserIntegrations {
  if (Array.isArray(userIntegrations)) {
    return addIntegrationToArray(integration, userIntegrations);
  } else {
    return addIntegrationToFunction(integration, userIntegrations);
  }
}

function addIntegrationToArray(integration: Integration, userIntegrations: Integration[]): Integration[] {
  if (userIntegrations.map(int => int.name).includes(integration.name)) {
    return userIntegrations;
  }
  return [...userIntegrations, integration];
}

function addIntegrationToFunction(
  integration: Integration,
  userIntegrationsFunc: UserFunctionIntegrations,
): UserFunctionIntegrations {
  const wrapper: UserFunctionIntegrations = defaultIntegrations => {
    const userFinalIntegrations = userIntegrationsFunc(defaultIntegrations);
    return addIntegrationToArray(integration, userFinalIntegrations);
  };
  return wrapper;
}
