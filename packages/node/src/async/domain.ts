import type { Carrier, Hub } from '@sentry/core';
import {
  ensureHubOnCarrier,
  getCurrentHub as getCurrentHubCore,
  getHubFromCarrier,
  setAsyncContextStrategy,
} from '@sentry/core';
import * as domain from 'domain';
import { EventEmitter } from 'events';

function getCurrentHub(): Hub | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  const activeDomain = (domain as any).active as Carrier;

  // If there's no active domain, just return undefined and the global hub will be used
  if (!activeDomain) {
    return undefined;
  }

  ensureHubOnCarrier(activeDomain);

  return getHubFromCarrier(activeDomain);
}

function runWithAsyncContext<T, A>(callback: (hub: Hub) => T, ...args: A[]): T {
  const local = domain.create();

  for (const emitter of args) {
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
