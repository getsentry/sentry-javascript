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
  const local = options?.reuseExisting ? getActiveDomain<domain.Domain>() || domain.create() : domain.create();

  for (const emitter of options.args || []) {
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
