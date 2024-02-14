import * as domain from 'domain';
import type { Carrier } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy, setHubOnCarrier } from '@sentry/core';
import type { Hub } from '@sentry/types';

function getActiveDomain<T>(): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (domain as any).active as T | undefined;
}

function getCurrentHub(): Hub | undefined {
  const activeDomain = getActiveDomain<Carrier>();

  // If there's no active domain, just return undefined and the global hub will be used
  if (!activeDomain) {
    return undefined;
  }

  ensureHubOnCarrier(activeDomain);

  return getHubFromCarrier(activeDomain);
}

function createNewHub(parent: Hub | undefined): Hub {
  const carrier: Carrier = {};
  ensureHubOnCarrier(carrier, parent);
  return getHubFromCarrier(carrier);
}

function runWithAsyncContext<T>(callback: () => T): T {
  const activeDomain = getActiveDomain<domain.Domain & Carrier>();

  const local = domain.create() as domain.Domain & Carrier;

  const parentHub = activeDomain ? getHubFromCarrier(activeDomain) : undefined;
  const newHub = createNewHub(parentHub);
  setHubOnCarrier(local, newHub);

  return local.bind(() => {
    return callback();
  })();
}

/**
 * Sets the async context strategy to use Node.js domains.
 */
export function setDomainAsyncContextStrategy(): void {
  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
