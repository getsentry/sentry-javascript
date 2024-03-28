import { Hub as HubClass, getGlobalHub } from '@sentry/core';
import { setAsyncContextStrategy } from '@sentry/core';
import type { Hub, Scope } from '@sentry/types';
import * as async_hooks from 'async_hooks';

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

type AsyncLocalStorageConstructor = { new <T>(): AsyncLocalStorage<T> };
// AsyncLocalStorage only exists in async_hook after Node v12.17.0 or v13.10.0
type NewerAsyncHooks = typeof async_hooks & { AsyncLocalStorage: AsyncLocalStorageConstructor };

let asyncStorage: AsyncLocalStorage<Hub>;

/**
 * Sets the async context strategy to use AsyncLocalStorage which requires Node v12.17.0 or v13.10.0.
 */
export function setHooksAsyncContextStrategy(): void {
  if (!asyncStorage) {
    asyncStorage = new (async_hooks as NewerAsyncHooks).AsyncLocalStorage<Hub>();
  }

  function getCurrentHooksHub(): Hub | undefined {
    return asyncStorage.getStore();
  }

  function getCurrentHub(): Hub {
    return getCurrentHooksHub() || getGlobalHub();
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
