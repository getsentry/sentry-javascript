import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy } from '@sentry/core';
import * as async_hooks from 'async_hooks';

interface AsyncLocalStorage<T> {
  getStore(): T | undefined;
  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R;
}

type AsyncLocalStorageConstructor = { new <T>(): AsyncLocalStorage<T> };
type NewerAsyncHooks = typeof async_hooks & { AsyncLocalStorage: AsyncLocalStorageConstructor };

let asyncStorage: AsyncLocalStorage<Hub>;
/**
 * Sets the async context strategy to use AsyncLocalStorage which requires Node v12.17.0 or v13.10.0.
 */
export function setHooksAsyncContextStrategy(): void {
  if (!asyncStorage) {
    asyncStorage = new (async_hooks as NewerAsyncHooks).AsyncLocalStorage<Hub>();
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
      return callback();
    }

    const newHub = createNewHub(existingHub);

    return asyncStorage.run(newHub, () => {
      return callback();
    });
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}

/**
 * Initiates the counting of created promises and settled promises.
 *
 * If `locations` is true, it will attempt to find the locations of each created promise
 * and return an object whose keys are the callsites as strings and whose values are the
 * number of promises created at that callsite.
 *
 * If `continuation` is true, promises will only be counted if there is an async
 * continuation chain (as determined by AsyncLocalStorage) back to the given `startCounter()` call.
 * This is helpful for filtering out unrelated promises, like ones from an unrelated concurrent HTTP request.
 *
 * @param {Object} opts - Options for counting promises.
 * @param {boolean} [opts.locations=false] - Whether to count promise locations.
 * @param {boolean} [opts.continuation=false] - Whether to consider async continuation chains.
 * @returns {function(): number | { [key: string]: number }} - A function to get the count of created and settled promises.
 */
/**
 *
 */
export function startCounter(
  opts: { locations: boolean; continuation: boolean } = { locations: false, continuation: false }
): () => { created: number; settled: number; locations: { [key: string]: number } } {
  const resultObject: { created: number; settled: number; locations: { [key: string]: number } } = {
    created: 0,
    settled: 0,
    locations: {},
  };

  function getLocation(): string {
    const stack = new Error().stack?.split('\n');
    let stackIndex = 2;
    let line = stack?.[stackIndex];
    while (
      line &&
      (line.includes(__filename) ||
        line.includes('node:internal/promise_hooks') ||
        line?.endsWith('<anonymous>)'))
    ) {
      line = stack?.[++stackIndex];
    }
    return (line || stack?.pop())?.substring(7) || '';
  }

  const init: () => void = () => {
    if (opts.locations) {
      const line = getLocation();
      resultObject.locations[line] = 1 + (resultObject.locations[line] || 0);
    }
  }

  if (opts.locations) {
    init();
  }

  return () => {
    return opts.locations
      ? resultObject
      : {
          created: resultObject.created || 0,
          settled: resultObject.settled || 0,
          locations: resultObject.locations,
        };
  };
}

// Example usage:
// 1. Call setHooksAsyncContextStrategy() in your application's entry point.
// 2. Use startCounter() to get a function that tracks promises.
// const trackPromises = startCounter({ locations: true, continuation: true });
// const promise1 = new Promise(resolve => setTimeout(resolve, 100));
// const promise2 = new Promise(resolve => setTimeout(resolve, 200));
// trackPromises(); // Call this to get the promise tracking results.
