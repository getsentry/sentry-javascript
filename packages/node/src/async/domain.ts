import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy, setHubOnCarrier } from '@sentry/core';
import * as domain from 'domain';

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

function runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T {
  const activeDomain = getActiveDomain<domain.Domain & Carrier>();

  if (activeDomain && options?.reuseExisting) {
    // We're already in a domain, so we don't need to create a new one, just call the callback with the current hub
    return callback();
  }

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
