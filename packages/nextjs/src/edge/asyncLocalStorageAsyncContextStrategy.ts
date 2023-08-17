import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy } from '@sentry/core';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

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
    __DEBUG_BUILD__ &&
      logger.warn(
        "Tried to register AsyncLocalStorage async context strategy in a runtime that doesn't support AsyncLocalStorage.",
      );
    return;
  }

  if (!asyncStorage) {
    asyncStorage = new MaybeGlobalAsyncLocalStorage();
  }

  function getCurrentHub(): Hub | undefined {
    return asyncStorage.getStore();
  }

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
