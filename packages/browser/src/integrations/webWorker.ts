import type { DebugImage, Integration, IntegrationFn } from '@sentry/core';
import { captureEvent, debug, defineIntegration, getClient, isPlainObject, isPrimitive } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { eventFromUnknownInput } from '../eventbuilder';
import { WINDOW } from '../helpers';
import { _eventFromRejectionWithPrimitive, _getUnhandledRejectionError } from './globalhandlers';

export const INTEGRATION_NAME = 'WebWorker' as const;

interface WebWorkerMessage {
  _sentryMessage: boolean;
  _sentryDebugIds?: Record<string, string>;
  _sentryModuleMetadata?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  _sentryWorkerError?: SerializedWorkerError;
  _sentryWasmImages?: Array<DebugImage>;
}

interface SerializedWorkerError {
  reason: unknown;
  filename?: string;
  /** Absent on workers registered by an SDK version that only forwarded rejections. */
  kind?: 'error' | 'unhandledrejection';
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

      // Handle module metadata
      if (event.data._sentryModuleMetadata) {
        DEBUG_BUILD && debug.log('Sentry module metadata web worker message received', event.data);
        // Merge worker's raw metadata into the global object
        // It will be parsed lazily when needed by getMetadataForUrl
        WINDOW._sentryModuleMetadata = {
          ...event.data._sentryModuleMetadata,
          // Module metadata of the main thread have precedence over the worker's in case of a collision.
          ...WINDOW._sentryModuleMetadata,
        };
      }

      // Handle WASM images from worker
      if (event.data._sentryWasmImages) {
        DEBUG_BUILD && debug.log('Sentry WASM images web worker message received', event.data);
        const existingImages =
          (WINDOW as typeof WINDOW & { _sentryWasmImages?: Array<DebugImage> })._sentryWasmImages || [];
        const newImages = event.data._sentryWasmImages.filter(
          (newImg: unknown) =>
            isPlainObject(newImg) &&
            typeof newImg.code_file === 'string' &&
            !existingImages.some(existing => existing.code_file === newImg.code_file),
        );
        (WINDOW as typeof WINDOW & { _sentryWasmImages?: Array<DebugImage> })._sentryWasmImages = [
          ...existingImages,
          ...newImages,
        ];
      }

      // Handle errors and unhandled rejections forwarded from worker
      if (event.data._sentryWorkerError) {
        DEBUG_BUILD && debug.log('Sentry worker error message received', event.data._sentryWorkerError);
        handleForwardedWorkerError(event.data._sentryWorkerError);
      }
    }
  });
}

function handleForwardedWorkerError(workerError: SerializedWorkerError): void {
  const client = getClient();
  if (!client) {
    return;
  }

  const { stackParser, attachStacktrace } = client.getOptions();

  const error = workerError.reason;
  // Older workers only ever forwarded rejections and send no `kind`.
  const isUnhandledRejection = workerError.kind !== 'error';

  // Follow same pattern as globalHandlers for each source.
  // A thrown primitive is not a rejection, so the rejection-specific wording must not apply to it.
  const event =
    isUnhandledRejection && isPrimitive(error)
      ? _eventFromRejectionWithPrimitive(error)
      : eventFromUnknownInput(stackParser, error, undefined, attachStacktrace, isUnhandledRejection);

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
      type: isUnhandledRejection ? 'auto.browser.web_worker.onunhandledrejection' : 'auto.browser.web_worker.onerror',
    },
  });

  DEBUG_BUILD && debug.log(`Captured worker ${isUnhandledRejection ? 'unhandled rejection' : 'error'}`, error);
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
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  location?: { href?: string };
}

interface RegisterWebWorkerOptions {
  self: MinimalDedicatedWorkerGlobalScope & {
    _sentryDebugIds?: Record<string, string>;
    _sentryModuleMetadata?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

/**
 * Use this function to register the worker with the Sentry SDK.
 *
 * This function will:
 * - Send debug IDs to the parent thread
 * - Send module metadata to the parent thread (for thirdPartyErrorFilterIntegration)
 * - Set up handlers for uncaught errors and unhandled rejections in the worker
 * - Forward both to the parent thread for capture
 *
 * Note: uncaught errors do bubble to the parent, but the propagated `ErrorEvent` carries
 * no `error` object, so globalHandlers can only build an event from the message string.
 * Forwarding them here preserves the real stack, which matters most for wasm frames.
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
  // Mirrors globalHandlersIntegration. The worker has no client of its own, so without this
  // V8's default of 10 truncates stacks before they can be forwarded.
  Error.stackTraceLimit = 50;

  // Send debug IDs and raw module metadata to parent thread
  // The metadata will be parsed lazily on the main thread when needed
  self.postMessage({
    _sentryMessage: true,
    _sentryDebugIds: self._sentryDebugIds ?? undefined,
    _sentryModuleMetadata: self._sentryModuleMetadata ?? undefined,
  });

  // Set up error handler inside the worker
  // Uncaught errors bubble to the parent, but structured clone preserves `stack` while the
  // propagated ErrorEvent does not, so forwarding is what gives the parent real frames
  self.addEventListener('error', (event: unknown) => {
    const { error, message } = event as { error?: unknown; message?: string };

    const serializedError: SerializedWorkerError = {
      reason: error ?? message,
      filename: self.location?.href,
      kind: 'error',
    };

    postSerializedWorkerError(self, serializedError);

    DEBUG_BUILD && debug.log('[Sentry Worker] Forwarding error to parent', serializedError);
  });

  // Set up unhandledrejection handler inside the worker
  // Following the same pattern as globalHandlers
  // unhandled rejections don't bubble to the parent thread, so we need to handle them here
  self.addEventListener('unhandledrejection', (event: unknown) => {
    const reason = _getUnhandledRejectionError(event);

    // Forward the raw reason to parent thread
    // The parent will handle primitives vs errors the same way globalHandlers does
    const serializedError: SerializedWorkerError = {
      reason: reason,
      filename: self.location?.href,
      kind: 'unhandledrejection',
    };

    postSerializedWorkerError(self, serializedError);

    DEBUG_BUILD && debug.log('[Sentry Worker] Forwarding unhandled rejection to parent', serializedError);
  });

  DEBUG_BUILD && debug.log('[Sentry Worker] Registered worker with error and unhandled rejection handling');
}

/**
 * `postMessage` structured-clones the reason. Errors clone well (`message`, `stack` and `cause`
 * all survive), but exotic values raise `DataCloneError`, which must never escape the worker's
 * own error handler.
 */
function postSerializedWorkerError(
  self: MinimalDedicatedWorkerGlobalScope,
  serializedError: SerializedWorkerError,
): void {
  try {
    self.postMessage({
      _sentryMessage: true,
      _sentryWorkerError: serializedError,
    });
    return;
  } catch {
    // Not cloneable, fall through and describe it instead.
  }

  try {
    self.postMessage({
      _sentryMessage: true,
      _sentryWorkerError: {
        ...serializedError,
        reason: `Worker error with non-cloneable reason: ${Object.prototype.toString.call(serializedError.reason)}`,
      },
    });
  } catch {
    // Dropping the forward is better than throwing out of the worker's error handler.
  }
}

function isSentryMessage(eventData: unknown): eventData is WebWorkerMessage {
  if (!isPlainObject(eventData) || eventData._sentryMessage !== true) {
    return false;
  }

  // Must have at least one of: debug IDs, module metadata, worker error, or WASM images
  const hasDebugIds = '_sentryDebugIds' in eventData;
  const hasModuleMetadata = '_sentryModuleMetadata' in eventData;
  const hasWorkerError = '_sentryWorkerError' in eventData;
  const hasWasmImages = '_sentryWasmImages' in eventData;

  if (!hasDebugIds && !hasModuleMetadata && !hasWorkerError && !hasWasmImages) {
    return false;
  }

  // Validate debug IDs if present
  if (hasDebugIds && !(isPlainObject(eventData._sentryDebugIds) || eventData._sentryDebugIds === undefined)) {
    return false;
  }

  // Validate module metadata if present
  if (
    hasModuleMetadata &&
    !(isPlainObject(eventData._sentryModuleMetadata) || eventData._sentryModuleMetadata === undefined)
  ) {
    return false;
  }

  // Validate worker error if present
  if (hasWorkerError && !isPlainObject(eventData._sentryWorkerError)) {
    return false;
  }

  // Validate WASM images if present
  if (
    hasWasmImages &&
    (!Array.isArray(eventData._sentryWasmImages) ||
      !eventData._sentryWasmImages.every(
        (img: unknown) => isPlainObject(img) && typeof (img as { code_file?: unknown }).code_file === 'string',
      ))
  ) {
    return false;
  }

  return true;
}
