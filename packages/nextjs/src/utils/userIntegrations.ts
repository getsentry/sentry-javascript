import { Integration } from '@sentry/types';

type UserIntegrations = Integration[] | UserFunctionIntegrations;
type UserFunctionIntegrations = (integrations: Integration[]) => Integration[];

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

  userIntegrations.push(integration);
  return userIntegrations;
}

function addIntegrationToFunction(
  integration: Integration,
  userIntegrations: UserFunctionIntegrations,
): UserFunctionIntegrations {
  const wrapper: UserFunctionIntegrations = defaultIntegrations => {
    const userFinalIntegrations: Integration[] = userIntegrations(defaultIntegrations);
    return addIntegrationToArray(integration, userFinalIntegrations);
  };
  return wrapper;
}
