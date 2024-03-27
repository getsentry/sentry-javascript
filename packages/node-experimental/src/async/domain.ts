import * as domain from 'domain';
import { getGlobalHub } from '@sentry/core';
import { Hub as HubClass } from '@sentry/core';
import { setAsyncContextStrategy } from '@sentry/core';
import type { Client, Hub, Scope } from '@sentry/types';

type DomainWithHub = domain.Domain & {
  hub?: Hub;
};

function getActiveDomain<T>(): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return (domain as any).active as T | undefined;
}

function getCurrentDomainHub(): Hub | undefined {
  const activeDomain = getActiveDomain<DomainWithHub>();

  // If there's no active domain, just return undefined and the global hub will be used
  if (!activeDomain) {
    return undefined;
  }

  if (activeDomain.hub) {
    return activeDomain.hub;
  }

  activeDomain.hub = getCurrentHub();
  return activeDomain.hub;
}

function getCurrentHub(): Hub {
  return getCurrentDomainHub() || getGlobalHub();
}

function withExecutionContext<T>(
  client: Client | undefined,
  scope: Scope,
  isolationScope: Scope,
  callback: () => T,
): T {
  const local = domain.create() as DomainWithHub;

  // eslint-disable-next-line deprecation/deprecation
  const newHub = new HubClass(client, scope, isolationScope);
  local.hub = newHub;

  return local.bind(() => {
    return callback();
  })();
}

function withScope<T>(callback: (scope: Scope) => T): T {
  const parentHub = getCurrentHub();

  /* eslint-disable deprecation/deprecation */
  const client = parentHub.getClient();
  const scope = parentHub.getScope().clone();
  const isolationScope = parentHub.getIsolationScope();
  /* eslint-enable deprecation/deprecation */

  return withExecutionContext(client, scope, isolationScope, () => {
    return callback(scope);
  });
}

function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
  const parentHub = getCurrentHub();

  /* eslint-disable deprecation/deprecation */
  const client = parentHub.getClient();
  const isolationScope = parentHub.getIsolationScope();
  /* eslint-enable deprecation/deprecation */

  return withExecutionContext(client, scope, isolationScope, () => {
    return callback(scope);
  });
}

function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
  const parentHub = getCurrentHub();

  /* eslint-disable deprecation/deprecation */
  const client = parentHub.getClient();
  const scope = parentHub.getScope().clone();
  const isolationScope = parentHub.getIsolationScope().clone();
  /* eslint-enable deprecation/deprecation */

  return withExecutionContext(client, scope, isolationScope, () => {
    return callback(isolationScope);
  });
}

function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
  const parentHub = getCurrentHub();

  /* eslint-disable deprecation/deprecation */
  const client = parentHub.getClient();
  const scope = parentHub.getScope().clone();
  /* eslint-enable deprecation/deprecation */

  return withExecutionContext(client, scope, isolationScope, () => {
    return callback(scope);
  });
}

/**
 * Sets the async context strategy to use Node.js domains.
 */
export function setDomainAsyncContextStrategy(): void {
  setAsyncContextStrategy({
    getCurrentHub,
    withScope,
    withSetScope,
    withIsolationScope,
    withSetIsolationScope,
    // eslint-disable-next-line deprecation/deprecation
    getCurrentScope: () => getCurrentHub().getScope(),
    // eslint-disable-next-line deprecation/deprecation
    getIsolationScope: () => getCurrentHub().getIsolationScope(),
  });
}
