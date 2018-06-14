import { Carrier, getGlobalHub as getGlobalHubBase, Hub } from '@sentry/hub';
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
 * TODO
 */
export function getGlobalHub(): Hub {
  // const domain = require('domain');
  const globalHub = getGlobalHubBase();
  if (!domain.active) {
    return globalHub;
  }

  let carrier = domain.active.__SENTRY__;
  if (!carrier) {
    domain.active.__SENTRY__ = carrier = {};
  }

  if (!carrier.hub) {
    carrier.hub = new Hub(globalHub.getStack().slice());
  }

  return carrier.hub;
}
