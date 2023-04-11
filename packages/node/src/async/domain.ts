import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import {
  ensureHubOnCarrier,
  getCurrentHub as getCurrentHubCore,
  getHubFromCarrier,
  setAsyncContextStrategy,
} from '@sentry/core';
import * as domain from 'domain';
import { EventEmitter } from 'events';

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

function runWithAsyncContext<T>(callback: (hub: Hub) => T, options: RunWithAsyncContextOptions): T {
  if (options?.reuseExisting) {
    const activeDomain = getActiveDomain<domain.Domain & Carrier>();

    if (activeDomain) {
      for (const emitter of options.emitters || []) {
        if (emitter instanceof EventEmitter) {
          activeDomain.add(emitter);
        }
      }

      // We're already in a domain, so we don't need to create a new one, just call the callback with the current hub
      return callback(getHubFromCarrier(activeDomain));
    }
  }

  const local = domain.create();

  for (const emitter of options.emitters || []) {
    if (emitter instanceof EventEmitter) {
      local.add(emitter);
    }
  }

  return local.bind(() => {
    const hub = getCurrentHubCore();
    return callback(hub);
  })();
}

/**
 * Sets the async context strategy to use Node.js domains.
 */
export function setDomainAsyncContextStrategy(): void {
  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
