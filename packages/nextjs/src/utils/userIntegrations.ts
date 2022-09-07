import { Integration } from '@sentry/types';

export type UserIntegrationsFunction = (integrations: Integration[]) => Integration[];
export type UserIntegrations = Integration[] | UserIntegrationsFunction;

type ForcedIntegrationOptions = {
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
  // The match will be null when there's no more recursing to do, i.e., when we've reached the right level of the object
  if (match === null) {
    obj[keyPath] = value;
  } else {
    // `match[1]` is the initial segment of the path, and `match[2]` is the remainder of the path
    setNestedKey(obj[match[1]], match[2], value);
  }
}

/**
 * Enforces inclusion of a given integration with specified options in an integration array originally determined by the
 * user, by either including the given default instance or by patching an existing user instance with the given options.
 *
 * Ideally this would happen when integrations are set up, but there isn't currently a mechanism there for merging
 * options from a default integration instance with those from a user-provided instance of the same integration, only
 * for allowing the user to override a default instance entirely. (TODO: Fix that.)
 *
 * @param defaultIntegrationInstance An instance of the integration with the correct options already set
 * @param userIntegrations Integrations defined by the user.
 * @param forcedOptions Options with which to patch an existing user-derived instance on the integration.
 * @returns A final integrations array.
 */
export function addOrUpdateIntegration(
  defaultIntegrationInstance: Integration,
  userIntegrations: UserIntegrations,
  forcedOptions: ForcedIntegrationOptions = {},
): UserIntegrations {
  if (Array.isArray(userIntegrations)) {
    return addOrUpdateIntegrationInArray(defaultIntegrationInstance, userIntegrations, forcedOptions);
  } else {
    return addOrUpdateIntegrationInFunction(defaultIntegrationInstance, userIntegrations, forcedOptions);
  }
}

function addOrUpdateIntegrationInArray(
  defaultIntegrationInstance: Integration,
  userIntegrations: Integration[],
  forcedOptions: ForcedIntegrationOptions,
): Integration[] {
  let includesName = false;
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let x = 0; x < userIntegrations.length; x++) {
    if (userIntegrations[x].name === defaultIntegrationInstance.name) {
      includesName = true;
    }

    const optionToSet = forcedOptions[userIntegrations[x].name];
    if (optionToSet) {
      setNestedKey(userIntegrations[x], optionToSet.keyPath, optionToSet.value);
    }
  }

  if (includesName) {
    return userIntegrations;
  }
  return [...userIntegrations, defaultIntegrationInstance];
}

function addOrUpdateIntegrationInFunction(
  defaultIntegrationInstance: Integration,
  userIntegrationsFunc: UserIntegrationsFunction,
  forcedOptions: ForcedIntegrationOptions,
): UserIntegrationsFunction {
  const wrapper: UserIntegrationsFunction = defaultIntegrations => {
    const userFinalIntegrations = userIntegrationsFunc(defaultIntegrations);
    return addOrUpdateIntegrationInArray(defaultIntegrationInstance, userFinalIntegrations, forcedOptions);
  };
  return wrapper;
}
