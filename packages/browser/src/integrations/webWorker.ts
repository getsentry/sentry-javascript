import type { Integration, IntegrationFn } from '@sentry/core';
import { captureEvent, debug, defineIntegration, getClient, isPlainObject, isPrimitive } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { eventFromUnknownInput } from '../eventbuilder';
import { WINDOW } from '../helpers';
import { _eventFromRejectionWithPrimitive, _getUnhandledRejectionError } from './globalhandlers';

export const INTEGRATION_NAME = 'WebWorker';

interface WebWorkerMessage {
  _sentryMessage: boolean;
  _sentryDebugIds?: Record<string, string>;
  _sentryWorkerError?: SerializedWorkerError;
}

interface SerializedWorkerError {
  reason: unknown;
  filename?: string;
}

interface WebWorkerIntegrationOptions {
  worker: Worker | Array<Worker>;
}

interface WebWorkerIntegration extends Integration {
  addWorker: (worker: Worker) => void;
}

/**
 * Use this integration to set up Sentry with web workers.
 *
 * IMPORTANT: This integration must be added **before** you start listening to
 * any messages from the worker. Otherwise, your message handlers will receive
 * messages from the Sentry SDK which you need to ignore.
 *
 * This integration only has an effect, if you call `Sentry.registerWebWorker(self)`
 * from within the worker(s) you're adding to the integration.
 *
 * Given that you want to initialize the SDK as early as possible, you most likely
 * want to add this integration **after** initializing the SDK:
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
 * const webWorkerIntegration = Sentry.webWorkerIntegration({ worker });
 * Sentry.addIntegration(webWorkerIntegration);
 *
 * // 3. Register message listeners on the worker
 * worker.addEventListener('message', event => {
 *  // ...
 * });
 * ```
 *
 * If you initialize multiple workers at the same time, you can also pass an array of workers
 * to the integration:
 *
 * ```ts filename={main.js}
 * const webWorkerIntegration = Sentry.webWorkerIntegration({ worker: [worker1, worker2] });
 * Sentry.addIntegration(webWorkerIntegration);
 * ```
 *
 * If you have any additional workers that you initialize at a later point,
 * you can add them to the integration as follows:
 *
 * ```ts filename={main.js}
 * const webWorkerIntegration = Sentry.webWorkerIntegration({ worker: worker1 });
 * Sentry.addIntegration(webWorkerIntegration);
 *
 * // sometime later:
 * webWorkerIntegration.addWorker(worker2);
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
    (Array.isArray(worker) ? worker : [worker]).forEach(w => listenForSentryMessages(w));
  },
  addWorker: (worker: Worker) => listenForSentryMessages(worker),
})) as IntegrationFn<WebWorkerIntegration>;

function listenForSentryMessages(worker: Worker): void {
  worker.addEventListener('message', event => {
    if (isSentryMessage(event.data)) {
      event.stopImmediatePropagation(); // other listeners should not receive this message

      // Handle debug IDs
      if (event.data._sentryDebugIds) {
        DEBUG_BUILD && debug.log('Sentry debugId web worker message received', event.data);
        WINDOW._sentryDebugIds = {
          ...event.data._sentryDebugIds,
          // debugIds of the main thread have precedence over the worker's in case of a collision.
          ...WINDOW._sentryDebugIds,
        };
      }

      // Handle unhandled rejections forwarded from worker
      if (event.data._sentryWorkerError) {
        DEBUG_BUILD && debug.log('Sentry worker rejection message received', event.data._sentryWorkerError);
        handleForwardedWorkerRejection(event.data._sentryWorkerError);
      }
    }
  });
}

function handleForwardedWorkerRejection(workerError: SerializedWorkerError): void {
  const client = getClient();
  if (!client) {
    return;
  }

  const stackParser = client.getOptions().stackParser;
  const attachStacktrace = client.getOptions().attachStacktrace;

  const error = workerError.reason;

  // Follow same pattern as globalHandlers for unhandledrejection
  // Handle both primitives and errors the same way
  const event = isPrimitive(error)
    ? _eventFromRejectionWithPrimitive(error)
    : eventFromUnknownInput(stackParser, error, undefined, attachStacktrace, true);

  event.level = 'error';

  // Add worker-specific context
  if (workerError.filename) {
    event.contexts = {
      ...event.contexts,
      worker: {
        filename: workerError.filename,
      },
    };
  }

  captureEvent(event, {
    originalException: error,
    mechanism: {
      handled: false,
      type: 'auto.browser.web_worker.onunhandledrejection',
    },
  });

  DEBUG_BUILD && debug.log('Captured worker unhandled rejection', error);
}

/**
 * Minimal interface for DedicatedWorkerGlobalScope, only requiring the postMessage method.
 * (which is the only thing we need from the worker's global object)
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope
 *
 * We can't use the actual type because it breaks everyone who doesn't have {"lib": ["WebWorker"]}
 * but uses {"skipLibCheck": true} in their tsconfig.json.
 */
interface MinimalDedicatedWorkerGlobalScope {
  postMessage: (message: unknown) => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  location?: { href?: string };
}

interface RegisterWebWorkerOptions {
  self: MinimalDedicatedWorkerGlobalScope & { _sentryDebugIds?: Record<string, string> };
}

/**
 * Use this function to register the worker with the Sentry SDK.
 *
 * This function will:
 * - Send debug IDs to the parent thread
 * - Set up a handler for unhandled rejections in the worker
 * - Forward unhandled rejections to the parent thread for capture
 *
 * Note: Synchronous errors in workers are already captured by globalHandlers.
 * This only handles unhandled promise rejections which don't bubble to the parent.
 *
 * @example
 * ```ts filename={worker.js}
 * import * as Sentry from '@sentry/<your-sdk>';
 *
 * // Do this as early as possible in your worker.
 * Sentry.registerWebWorker({ self });
 *
 * // continue setting up your worker
 * self.postMessage(...)
 * ```
 * @param options {RegisterWebWorkerOptions} Integration options:
 *   - `self`: The worker instance you're calling this function from (self).
 */
export function registerWebWorker({ self }: RegisterWebWorkerOptions): void {
  // Send debug IDs to parent thread
  self.postMessage({
    _sentryMessage: true,
    _sentryDebugIds: self._sentryDebugIds ?? undefined,
  });

  // Set up unhandledrejection handler inside the worker
  // Following the same pattern as globalHandlers
  // unhandled rejections don't bubble to the parent thread, so we need to handle them here
  self.addEventListener('unhandledrejection', (event: any) => {
    const reason = _getUnhandledRejectionError(event);

    // Forward the raw reason to parent thread
    // The parent will handle primitives vs errors the same way globalHandlers does
    const serializedError: SerializedWorkerError = {
      reason: reason,
      filename: self.location?.href,
    };

    // Forward to parent thread
    self.postMessage({
      _sentryMessage: true,
      _sentryWorkerError: serializedError,
    });

    DEBUG_BUILD && console.log('[Sentry Worker] Forwarding unhandled rejection to parent', serializedError);
  });

  DEBUG_BUILD && console.log('[Sentry Worker] Registered worker with unhandled rejection handling');
}

function isSentryMessage(eventData: unknown): eventData is WebWorkerMessage {
  if (!isPlainObject(eventData) || eventData._sentryMessage !== true) {
    return false;
  }

  // Must have at least one of: debug IDs or worker error
  const hasDebugIds = '_sentryDebugIds' in eventData;
  const hasWorkerError = '_sentryWorkerError' in eventData;

  if (!hasDebugIds && !hasWorkerError) {
    return false;
  }

  // Validate debug IDs if present
  if (hasDebugIds && !(isPlainObject(eventData._sentryDebugIds) || eventData._sentryDebugIds === undefined)) {
    return false;
  }

  // Validate worker error if present
  if (hasWorkerError && !isPlainObject(eventData._sentryWorkerError)) {
    return false;
  }

  return true;
}
