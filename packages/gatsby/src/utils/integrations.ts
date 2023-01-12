import * as Tracing from '@sentry/tracing';
import type { Integration } from '@sentry/types';

import type { GatsbyOptions } from './types';

type UserFnIntegrations = (integrations: Integration[]) => Integration[];
export type UserIntegrations = Integration[] | UserFnIntegrations;

/**
 * Returns the integrations to add to the SDK.
 * If tracing is enabled, `BrowserTracing` is always present.
 *
 * @param options The options users have defined.
 */
export function getIntegrationsFromOptions(options: GatsbyOptions): UserIntegrations {
  const isTracingEnabled = Tracing.hasTracingEnabled(options);
  if (options.integrations === undefined) {
    return getIntegrationsFromArray([], isTracingEnabled);
  } else if (Array.isArray(options.integrations)) {
    return getIntegrationsFromArray(options.integrations, isTracingEnabled);
  } else {
    return getIntegrationsFromFunction(options.integrations, isTracingEnabled);
  }
}

/**
 * Returns the integrations to add to the SDK, from the given integrations array.
 *
 * @param userIntegrations Array of user's integrations.
 * @param isTracingEnabled Whether the user has enabled tracing.
 */
function getIntegrationsFromArray(userIntegrations: Integration[], isTracingEnabled: boolean): Integration[] {
  if (
    isTracingEnabled &&
    !userIntegrations.some(integration => integration.name === Tracing.Integrations.BrowserTracing.name)
  ) {
    userIntegrations.push(new Tracing.Integrations.BrowserTracing());
  }
  return userIntegrations;
}

/**
 * Returns the integrations to add to the SDK, from the given function.
 *
 * @param userIntegrations Function returning the user's integrations.
 * @param isTracingEnabled Whether the user has enabled tracing.
 */
function getIntegrationsFromFunction(
  userIntegrations: UserFnIntegrations,
  isTracingEnabled: boolean,
): UserFnIntegrations {
  const wrapper: UserFnIntegrations = (defaultIntegrations: Integration[]) => {
    return getIntegrationsFromArray(userIntegrations(defaultIntegrations), isTracingEnabled);
  };
  return wrapper;
}
