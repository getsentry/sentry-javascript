import { Carrier, getMainHub as getMainHubBase, Hub } from '@sentry/hub';
import * as domain from 'domain';

declare module 'domain' {
  export let active: Domain;
  /**
   * Extension for domain interface
   */
  export interface Domain {
    __SENTRY__?: Carrier;
  }
}

/**
 * Returns the latest global hub instance.
 *
 * If a hub is already registered in the global carrier but this module
 * contains a more recent version, it replaces the registered version.
 * Otherwise, the currently registered hub will be returned.
 */
export function getMainHub(): Hub {
  const globalHub = getMainHubBase();
  if (!domain.active) {
    return globalHub;
  }

  let carrier = domain.active.__SENTRY__;
  if (!carrier) {
    domain.active.__SENTRY__ = carrier = {};
  }

  if (!carrier.hub) {
    const top = globalHub.getStackTop();
    carrier.hub = top ? new Hub(top.client, top.scope) : new Hub();
  }

  return carrier.hub;
}
