import { Integration } from '@sentry/types';

export type UserFunctionIntegrations = (integrations: Integration[]) => Integration[];
export type UserIntegrations = Integration[] | UserFunctionIntegrations;

type Options = {
  [integrationName: string]:
    | {
        keyPath: string;
        value: unknown;
      }
    | undefined;
};

/**
 * Recursively traverses an object to update an existing nested key.
 * Note: The provided key path must include existing properties,
 * the function will not create objects while traversing.
 *
 * @param obj An object to update
 * @param value The value to update the nested key with
 * @param keyPath The path to the key to update ex. fizz.buzz.foo
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setNestedKey(obj: Record<string, any>, keyPath: string, value: unknown): void {
  // Ex. foo.bar.zoop will extract foo and bar.zoop
  const match = keyPath.match(/([a-z]+)\.(.*)/i);
  if (match === null) {
    obj[keyPath] = value;
  } else {
    setNestedKey(obj[match[1]], match[2], value);
  }
}

/**
 * Retrieves the patched integrations with the provided integration.
 *
 * The integration must be present in the final user integrations, and they are compared
 * by integration name. If the user has defined one, there's nothing to patch; if not,
 * the provided integration is added.
 *
 * @param integration The integration to patch, if necessary.
 * @param userIntegrations Integrations defined by the user.
 * @param options options to update for a particular integration
 * @returns Final integrations, patched if necessary.
 */
export function addIntegration(
  integration: Integration,
  userIntegrations: UserIntegrations,
  options: Options = {},
): UserIntegrations {
  if (Array.isArray(userIntegrations)) {
    return addIntegrationToArray(integration, userIntegrations, options);
  } else {
    return addIntegrationToFunction(integration, userIntegrations, options);
  }
}

function addIntegrationToArray(
  integration: Integration,
  userIntegrations: Integration[],
  options: Options,
): Integration[] {
  let includesName = false;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let x = 0; x < userIntegrations.length; x++) {
    if (userIntegrations[x].name === integration.name) {
      includesName = true;
    }

    const op = options[userIntegrations[x].name];
    if (op) {
      setNestedKey(userIntegrations[x], op.keyPath, op.value);
    }
  }

  if (includesName) {
    return userIntegrations;
  }
  return [...userIntegrations, integration];
}

function addIntegrationToFunction(
  integration: Integration,
  userIntegrationsFunc: UserFunctionIntegrations,
  options: Options,
): UserFunctionIntegrations {
  const wrapper: UserFunctionIntegrations = defaultIntegrations => {
    const userFinalIntegrations = userIntegrationsFunc(defaultIntegrations);
    return addIntegrationToArray(integration, userFinalIntegrations, options);
  };
  return wrapper;
}
