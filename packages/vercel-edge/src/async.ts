import { Hub as HubClass, getGlobalHub } from '@sentry/core';
import { setAsyncContextStrategy } from '@sentry/core';
import type { Hub, Scope } from '@sentry/types';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const MaybeGlobalAsyncLocalStorage = (GLOBAL_OBJ as any).AsyncLocalStorage;

let asyncStorage: AsyncLocalStorage<Hub>;

/**
 * Sets the async context strategy to use AsyncLocalStorage which should be available in the edge runtime.
 */
export function setAsyncLocalStorageAsyncContextStrategy(): void {
  if (!MaybeGlobalAsyncLocalStorage) {
    DEBUG_BUILD &&
      logger.warn(
        "Tried to register AsyncLocalStorage async context strategy in a runtime that doesn't support AsyncLocalStorage.",
      );
    return;
  }

  if (!asyncStorage) {
    asyncStorage = new MaybeGlobalAsyncLocalStorage();
  }

  function getCurrentAsyncStorageHub(): Hub | undefined {
    return asyncStorage.getStore();
  }

  function getCurrentHub(): Hub {
    return getCurrentAsyncStorageHub() || getGlobalHub();
  }

  function withScope<T>(callback: (scope: Scope) => T): T {
    const parentHub = getCurrentHub();

    /* eslint-disable deprecation/deprecation */
    const client = parentHub.getClient();
    const scope = parentHub.getScope().clone();
    const isolationScope = parentHub.getIsolationScope();
    const newHub = new HubClass(client, scope, isolationScope);
    /* eslint-enable deprecation/deprecation */

    return asyncStorage.run(newHub, () => {
      return callback(scope);
    });
  }

  function withSetScope<T>(scope: Scope, callback: (scope: Scope) => T): T {
    const parentHub = getCurrentHub();

    /* eslint-disable deprecation/deprecation */
    const client = parentHub.getClient();
    const isolationScope = parentHub.getIsolationScope();
    const newHub = new HubClass(client, scope, isolationScope);
    /* eslint-enable deprecation/deprecation */

    return asyncStorage.run(newHub, () => {
      return callback(scope);
    });
  }

  function withIsolationScope<T>(callback: (isolationScope: Scope) => T): T {
    const parentHub = getCurrentHub();

    /* eslint-disable deprecation/deprecation */
    const client = parentHub.getClient();
    const scope = parentHub.getScope().clone();
    const isolationScope = parentHub.getIsolationScope().clone();
    const newHub = new HubClass(client, scope, isolationScope);
    /* eslint-enable deprecation/deprecation */

    return asyncStorage.run(newHub, () => {
      return callback(isolationScope);
    });
  }

  function withSetIsolationScope<T>(isolationScope: Scope, callback: (isolationScope: Scope) => T): T {
    const parentHub = getCurrentHub();

    /* eslint-disable deprecation/deprecation */
    const client = parentHub.getClient();
    const scope = parentHub.getScope().clone();
    const newHub = new HubClass(client, scope, isolationScope);
    /* eslint-enable deprecation/deprecation */

    return asyncStorage.run(newHub, () => {
      return callback(isolationScope);
    });
  }

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
