import type { Carrier, Scope } from '@sentry/core';
import { Hub } from '@sentry/core';
import type { Client } from '@sentry/types';
import { getGlobalSingleton, GLOBAL_OBJ } from '@sentry/utils';

import { OpenTelemetryScope } from './scope';

/**
 * A custom hub that ensures we always creat an OTEL scope.
 * Exported only for testing
 */
export class OpenTelemetryHub extends Hub {
  public constructor(client?: Client, scope: Scope = new OpenTelemetryScope()) {
    super(client, scope);
  }

  /**
   * @inheritDoc
   */
  public pushScope(): Scope {
    // We want to clone the content of prev scope
    const scope = OpenTelemetryScope.clone(this.getScope());
    this.getStack().push({
      client: this.getClient(),
      scope,
    });
    return scope;
  }
}

/**
 * *******************************************************************************
 * Everything below here is a copy of the stuff from core's hub.ts,
 * only that we make sure to create our custom NodeExperimentalScope instead of the default Scope.
 * This is necessary to get the correct breadcrumbs behavior.
 *
 * Basically, this overwrites all places that do `new Scope()` with `new NodeExperimentalScope()`.
 * Which in turn means overwriting all places that do `new Hub()` and make sure to pass in a NodeExperimentalScope instead.
 * *******************************************************************************
 */

/**
 * API compatibility version of this hub.
 *
 * WARNING: This number should only be increased when the global interface
 * changes and new methods are introduced.
 *
 * @hidden
 */
const API_VERSION = 4;

/**
 * Returns the default hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 */
export function getCurrentHub(): Hub {
  // Get main carrier (global for every environment)
  const registry = getMainCarrier();

  if (registry.__SENTRY__ && registry.__SENTRY__.acs) {
    const hub = registry.__SENTRY__.acs.getCurrentHub();

    if (hub) {
      return hub;
    }
  }

  // Return hub that lives on a global object
  return getGlobalHub(registry);
}

/**
 * Ensure the global hub is an OpenTelemetryHub.
 */
export function setupGlobalHub(): void {
  const globalRegistry = getMainCarrier();

  if (getGlobalHub(globalRegistry) instanceof OpenTelemetryHub) {
    return;
  }

  // If the current global hub is not correct, ensure we overwrite it
  setHubOnCarrier(globalRegistry, new OpenTelemetryHub());
}

/**
 * This will create a new {@link Hub} and add to the passed object on
 * __SENTRY__.hub.
 * @param carrier object
 * @hidden
 */
export function getHubFromCarrier(carrier: Carrier): Hub {
  return getGlobalSingleton<Hub>('hub', () => new OpenTelemetryHub(), carrier);
}

/**
 * @private Private API with no semver guarantees!
 *
 * If the carrier does not contain a hub, a new hub is created with the global hub client and scope.
 */
export function ensureHubOnCarrier(carrier: Carrier, parent: Hub = getGlobalHub()): void {
  // If there's no hub on current domain, or it's an old API, assign a new one
  if (!hasHubOnCarrier(carrier) || getHubFromCarrier(carrier).isOlderThan(API_VERSION)) {
    const globalHubTopStack = parent.getStackTop();
    setHubOnCarrier(
      carrier,
      new OpenTelemetryHub(globalHubTopStack.client, OpenTelemetryScope.clone(globalHubTopStack.scope)),
    );
  }
}

function getGlobalHub(registry: Carrier = getMainCarrier()): Hub {
  // If there's no hub, or its an old API, assign a new one
  if (!hasHubOnCarrier(registry) || getHubFromCarrier(registry).isOlderThan(API_VERSION)) {
    setHubOnCarrier(registry, new OpenTelemetryHub());
  }

  // Return hub that lives on a global object
  return getHubFromCarrier(registry);
}

/**
 * This will tell whether a carrier has a hub on it or not
 * @param carrier object
 */
function hasHubOnCarrier(carrier: Carrier): boolean {
  return !!(carrier && carrier.__SENTRY__ && carrier.__SENTRY__.hub);
}

/**
 * Returns the global shim registry.
 *
 * FIXME: This function is problematic, because despite always returning a valid Carrier,
 * it has an optional `__SENTRY__` property, which then in turn requires us to always perform an unnecessary check
 * at the call-site. We always access the carrier through this function, so we can guarantee that `__SENTRY__` is there.
 **/
function getMainCarrier(): Carrier {
  GLOBAL_OBJ.__SENTRY__ = GLOBAL_OBJ.__SENTRY__ || {
    extensions: {},
    hub: undefined,
  };
  return GLOBAL_OBJ;
}

/**
 * This will set passed {@link Hub} on the passed object's __SENTRY__.hub attribute
 * @param carrier object
 * @param hub Hub
 * @returns A boolean indicating success or failure
 */
function setHubOnCarrier(carrier: Carrier, hub: Hub): boolean {
  if (!carrier) return false;
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});
  __SENTRY__.hub = hub;
  return true;
}
