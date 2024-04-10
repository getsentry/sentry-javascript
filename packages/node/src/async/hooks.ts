import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy } from '@sentry/core';
import * as async_hooks from 'async_hooks';

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

type AsyncLocalStorageConstructor = { new <T>(): AsyncLocalStorage<T> };
// AsyncLocalStorage only exists in async_hook after Node v12.17.0 or v13.10.0
type NewerAsyncHooks = typeof async_hooks & { AsyncLocalStorage: AsyncLocalStorageConstructor };

// eslint-disable-next-line deprecation/deprecation
let asyncStorage: AsyncLocalStorage<Hub>;

/**
 * Sets the async context strategy to use AsyncLocalStorage which requires Node v12.17.0 or v13.10.0.
 */
export function setHooksAsyncContextStrategy(): void {
  if (!asyncStorage) {
    // eslint-disable-next-line deprecation/deprecation
    asyncStorage = new (async_hooks as NewerAsyncHooks).AsyncLocalStorage<Hub>();
  }

  // eslint-disable-next-line deprecation/deprecation
  function getCurrentHub(): Hub | undefined {
    return asyncStorage.getStore();
  }

  // eslint-disable-next-line deprecation/deprecation
  function createNewHub(parent: Hub | undefined): Hub {
    const carrier: Carrier = {};
    ensureHubOnCarrier(carrier, parent);
    return getHubFromCarrier(carrier);
  }

  function runWithAsyncContext<T>(callback: () => T, options: RunWithAsyncContextOptions): T {
    const existingHub = getCurrentHub();

    if (existingHub && options?.reuseExisting) {
      // We're already in an async context, so we don't need to create a new one
      // just call the callback with the current hub
      return callback();
    }

    const newHub = createNewHub(existingHub);

    return asyncStorage.run(newHub, () => {
      return callback();
    });
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
