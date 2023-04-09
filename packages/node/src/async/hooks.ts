import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import {
  ensureHubOnCarrier,
  // getCurrentHub as getCurrentHubCore,
  getHubFromCarrier,
  setAsyncContextStrategy,
} from '@sentry/core';

interface AsyncLocalStorage<T> {
  disable(): void;
  getStore(): T | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exit<R, TArgs extends any[]>(callback: (...args: TArgs) => R, ...args: TArgs): R;
  enterWith(store: T): void;
}

function createAsyncLocalStorage<T>(): AsyncLocalStorage<T> {
  // async_hooks does not exist before Node v12.17

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AsyncLocalStorage } = require('async_hooks');
  return new AsyncLocalStorage();
}

/**
 * Sets the async context strategy to use Node.js async_hooks.
 */
export function setHooksAsyncContextStrategy(): void {
  const asyncStorage = createAsyncLocalStorage<Hub>();

  function getCurrentHub(): Hub | undefined {
    return asyncStorage.getStore();
  }

  function createNewHub(): Hub {
    const carrier: Carrier = {};
    ensureHubOnCarrier(carrier);
    return getHubFromCarrier(carrier);
  }

  function runWithAsyncContext<T>(callback: (hub: Hub) => T, options: RunWithAsyncContextOptions): T {
    if (options?.reuseExisting) {
      const existingHub = getCurrentHub();

      if (existingHub) {
        // We're already in an async context, so we don't need to create a new one
        // just call the callback with the current hub
        return callback(existingHub);
      }
    }

    const newHub = createNewHub();

    return asyncStorage.run(newHub, () => {
      return callback(newHub);
    });
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}
