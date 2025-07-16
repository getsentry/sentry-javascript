import { debug, defineIntegration, isPlainObject } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';

export const INTEGRATION_NAME = 'WebWorker';

interface WebWorkerMessage {
  _sentryMessage: boolean;
  _sentryDebugIds?: Record<string, string>;
}

interface WebWorkerIntegrationOptions {
  worker: Worker;
}

/**
 * Use this integration to set up Sentry with web workers.
 *
 * IMPORTANT: This integration must be added **before** you start listening to
 * any messages from the worker. Otherwise, your message handlers will receive
 * messages from Sentry which you need to ignore.
 *
 * This integration only has an effect, if you call `Sentry.registerWorker(self)`
 * from within the worker you're adding to the integration.
 *
 * Given that you want to initialize the SDK as early as possible, you most likely
 * want to add the integration after initializing the SDK:
 *
 * @example:
 * ```ts filename={main.js}
 * import * as Sentry from '@sentry/<your-sdk>';
 *
 * // some time earlier:
 * Sentry.init(...)
 *
 * // 1. Initialize the worker
 * const worker = new Worker(new URL('./worker.ts', import.meta.url));
 *
 * // 2. Add the integration
 * Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));
 *
 * // 3. Register message listeners on the worker
 * worker.addEventListener('message', event => {
 *  // ...
 * });
 * ```
 *
 * Of course, you can also directly add the integration in Sentry.init:
 * ```ts filename={main.js}
 * import * as Sentry from '@sentry/<your-sdk>';
 *
 * // 1. Initialize the worker
 * const worker = new Worker(new URL('./worker.ts', import.meta.url));
 *
 * // 2. Initialize the SDK
 * Sentry.init({
 *  integrations: [Sentry.webWorkerIntegration({ worker })]
 * });
 *
 * // 3. Register message listeners on the worker
 * worker.addEventListener('message', event => {
 *  // ...
 * });
 * ```
 *
 * @param options {WebWorkerIntegrationOptions} Integration options:
 *   - `worker`: The worker instance.
 */
export const webWorkerIntegration = defineIntegration(({ worker }: WebWorkerIntegrationOptions) => ({
  name: INTEGRATION_NAME,
  setupOnce: () => {
    worker.addEventListener('message', event => {
      if (isSentryDebugIdMessage(event.data)) {
        event.stopImmediatePropagation(); // other listeners should not receive this message
        DEBUG_BUILD && debug.log('Sentry debugId web worker message received', event.data);
        WINDOW._sentryDebugIds = {
          ...event.data._sentryDebugIds,
          // debugIds of the main thread have precedence over the worker's in case of a collision.
          ...WINDOW._sentryDebugIds,
        };
      }
    });
  },
}));

interface RegisterWebWorkerOptions {
  self: Worker & { _sentryDebugIds?: Record<string, string> };
}

/**
 * Use this function to register the worker with the Sentry SDK.
 *
 * @example
 * ```ts filename={worker.js}
 * import * as Sentry from '@sentry/<your-sdk>';
 *
 * // Do this as early as possible in your worker.
 * Sentry.registerWorker({ self });
 *
 * // continue setting up your worker
 * self.postMessage(...)
 * ```
 * @param options {RegisterWebWorkerOptions} Integration options:
 *   - `self`: The worker instance you're calling this function from (self).
 */
export function registerWebWorker({ self }: RegisterWebWorkerOptions): void {
  self.postMessage({
    _sentryMessage: true,
    _sentryDebugIds: self._sentryDebugIds ?? undefined,
  });
}

function isSentryDebugIdMessage(eventData: unknown): eventData is WebWorkerMessage {
  return (
    isPlainObject(eventData) &&
    eventData._sentryMessage === true &&
    '_sentryDebugIds' in eventData &&
    (isPlainObject(eventData._sentryDebugIds) || eventData._sentryDebugIds === undefined)
  );
}
