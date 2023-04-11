import type { Carrier, Hub, RunWithAsyncContextOptions } from '@sentry/core';
import { ensureHubOnCarrier, getHubFromCarrier, setAsyncContextStrategy } from '@sentry/core';

/** */
export function setBrowserErrorFrameAsyncContextStrategy(): void {
  let id = 0;
  const hubs = new Map<number, Hub>();

  /** */
  function getCurrentHub(): Hub | undefined {
    const stackId = _getHubIdFromStack();
    return stackId === undefined ? undefined : hubs.get(stackId);
  }

  /** */
  function createNewHub(parent: Hub | undefined): Hub {
    const carrier: Carrier = {};
    ensureHubOnCarrier(carrier, parent);
    return getHubFromCarrier(carrier);
  }

  /** */
  function runWithAsyncContext<T>(callback: (hub: Hub) => T, options: RunWithAsyncContextOptions): T {
    const existingHub = getCurrentHub();

    if (existingHub && options && options.reuseExisting) {
      // We're already in an async context, so we don't need to create a new one
      // just call the callback with the current hub
      return callback(existingHub);
    }

    const newHub = createNewHub(existingHub);

    const hubId = id++;
    const fnName = `SENTRY_HUB_ID_${hubId}`;

    return {
      [fnName]: (cb: (hub: Hub) => T) => {
        hubs.set(hubId, newHub);
        return cb(newHub);
      },
    }[fnName](callback);
  }

  setAsyncContextStrategy({ getCurrentHub, runWithAsyncContext });
}

function _getHubIdFromStack(): number | undefined {
  const e = new Error();
  const key = (e.stack && e.stack.match(/(?<=SENTRY_HUB_ID_)(?:\d+)/)) || [];
  const value = Number.parseInt(key[0], 10);
  return Number.isNaN(value) ? undefined : value;
}
