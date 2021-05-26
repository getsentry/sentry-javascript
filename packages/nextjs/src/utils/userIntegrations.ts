import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils';

export type IntegrationsFunction = (integrations: Integration[]) => Integration[];
export type UserIntegrations = Integration[] | IntegrationsFunction;

/** Pairs of a property's path within an integration object (ex: `options.xyz`) and the desired value for that property */
type IntegrationProperties = Array<[string, unknown]>;

/**
 * Recursively traverses an object to update an existing nested key.
 * Note: The provided key path must include existing properties,
 * as the function will not create objects while traversing.
 *
 * @param obj An object to update
 * @param value The value to update the nested key with
 * @param keyPath The path to the key to update ex. fizz.buzz.foo
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setNestedKey(obj: Record<string, any>, keyPath: string, value: unknown): void {
  // Split first path segment from the rest
  // Ex. foo.bar.zoop will extract foo and bar.zoop
  const match = keyPath.match(/([a-z]+)\.(.*)/i);
  if (match === null) {
    // assuming no illegal characters, the only way for the match to be null is if there's no period after the first
    // capture group, which means we've reached the end of the path and can set the value
    obj[keyPath] = value;
  } else {
    // follow the path down one level and repeat
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
  options: IntegrationProperties = [],
): UserIntegrations {
  if (Array.isArray(userIntegrations)) {
    return addIntegrationToArray(integration, userIntegrations, options);
  } else {
    return addIntegrationToFunction(integration, userIntegrations, options);
  }
}

/**
 * Add an integration to an integration array, or update its options if it already exists.
 *
 * @param newIntegration The integration to add, with the correct options
 * @param userIntegrations The array of existing integrations
 * @param newOptions Options to be set in case the integration already exists
 * @returns The modified array
 */
function addIntegrationToArray(
  newIntegration: Integration,
  userIntegrations: Integration[],
  newOptions: IntegrationProperties,
): Integration[] {
  const userIntegrationNames = userIntegrations.map(integration => integration.name);
  const existingIntegrationIndex = userIntegrationNames.indexOf(newIntegration.name);

  if (existingIntegrationIndex === -1) {
    // the user doesn't already have the integration, so just use the instance we already have, since it has the correct
    // options already
    userIntegrations.push(newIntegration);
  }
  // set or overwrite options in the existing integration instance
  else {
    const existingIntegration = userIntegrations[existingIntegrationIndex];
    newOptions.forEach(([optionPath, value]) => {
      try {
        setNestedKey(existingIntegration, optionPath, value);
      } catch (err) {
        logger.error(`Unable to set options for ${newIntegration.name}. Received error: ${err}`);
      }
    });
  }

  return userIntegrations;
}

/**
 * Wrap a given integration function to make sure the result includes the given integration
 *
 * @param newIntegration The integration to add
 * @param userIntegrationsFunc A function which returns integrations
 * @param integrationOptions Options for the new integration
 * @returns A wrapped version of the function
 */
function addIntegrationToFunction(
  newIntegration: Integration,
  userIntegrationsFunc: IntegrationsFunction,
  integrationOptions: IntegrationProperties,
): IntegrationsFunction {
  const wrapper: IntegrationsFunction = defaultIntegrations => {
    const userFinalIntegrations = userIntegrationsFunc(defaultIntegrations);
    return addIntegrationToArray(newIntegration, userFinalIntegrations, integrationOptions);
  };
  return wrapper;
}
