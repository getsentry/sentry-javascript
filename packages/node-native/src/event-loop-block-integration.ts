import { isPromise } from 'node:util/types';
import { isMainThread, Worker } from 'node:worker_threads';
import type {
  Client,
  ClientOptions,
  Contexts,
  DsnComponents,
  Event,
  EventHint,
  Integration,
  IntegrationFn,
} from '@sentry/core';
import { defineIntegration, getClient, getFilenameToDebugIdMap, getIsolationScope, logger } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { registerThread, threadPoll } from '@sentry-internal/node-native-stacktrace';
import type { ThreadBlockedIntegrationOptions, WorkerStartData } from './common';
import { POLL_RATIO } from './common';

const INTEGRATION_NAME = 'ThreadBlocked';
const DEFAULT_THRESHOLD_MS = 1_000;

function log(message: string, ...args: unknown[]): void {
  logger.log(`[Sentry Event Loop Blocked] ${message}`, ...args);
}

/**
 * Gets contexts by calling all event processors. This shouldn't be called until all integrations are setup
 */
async function getContexts(client: NodeClient): Promise<Contexts> {
  let event: Event | null = { message: INTEGRATION_NAME };
  const eventHint: EventHint = {};

  for (const processor of client.getEventProcessors()) {
    if (event === null) break;
    event = await processor(event, eventHint);
  }

  return event?.contexts || {};
}

type IntegrationInternal = { start: () => void; stop: () => void };

function poll(enabled: boolean, clientOptions: ClientOptions): void {
  try {
    const currentSession = getIsolationScope().getSession();
    // We need to copy the session object and remove the toJSON method so it can be sent to the worker
    // serialized without making it a SerializedSession
    const session = currentSession ? { ...currentSession, toJSON: undefined } : undefined;
    // message the worker to tell it the main event loop is still running
    threadPoll({ session, debugImages: getFilenameToDebugIdMap(clientOptions.stackParser) }, !enabled);
  } catch (_) {
    // we ignore all errors
  }
}

/**
 * Starts polling
 */
function startPolling(
  client: Client,
  integrationOptions: Partial<ThreadBlockedIntegrationOptions>,
): IntegrationInternal | undefined {
  registerThread();

  let enabled = true;

  const initOptions = client.getOptions();
  const pollInterval = (integrationOptions.threshold || DEFAULT_THRESHOLD_MS) / POLL_RATIO;

  // unref so timer does not block exit
  setInterval(() => poll(enabled, initOptions), pollInterval).unref();

  return {
    start: () => {
      enabled = true;
    },
    stop: () => {
      enabled = false;
      // poll immediately because the timer above might not get a chance to run
      // before the event loop gets blocked
      poll(enabled, initOptions);
    },
  };
}

/**
 * Starts the worker thread that will monitor the other threads.
 *
 * This function is only called in the main thread.
 */
async function startWorker(
  dsn: DsnComponents,
  client: NodeClient,
  integrationOptions: Partial<ThreadBlockedIntegrationOptions>,
): Promise<void> {
  const contexts = await getContexts(client);

  // These will not be accurate if sent later from the worker thread
  delete contexts.app?.app_memory;
  delete contexts.device?.free_memory;

  const initOptions = client.getOptions();

  const sdkMetadata = client.getSdkMetadata() || {};
  if (sdkMetadata.sdk) {
    sdkMetadata.sdk.integrations = initOptions.integrations.map(i => i.name);
  }

  const options: WorkerStartData = {
    debug: logger.isEnabled(),
    dsn,
    tunnel: initOptions.tunnel,
    environment: initOptions.environment || 'production',
    release: initOptions.release,
    dist: initOptions.dist,
    sdkMetadata,
    appRootPath: integrationOptions.appRootPath,
    threshold: integrationOptions.threshold || DEFAULT_THRESHOLD_MS,
    maxEventsPerHour: integrationOptions.maxEventsPerHour || 1,
    staticTags: integrationOptions.staticTags || {},
    contexts,
  };

  const worker = new Worker(new URL('./event-loop-block-watchdog.js', import.meta.url), {
    workerData: options,
    // We don't want any Node args like --import to be passed to the worker
    execArgv: [],
    env: { ...process.env, NODE_OPTIONS: undefined },
  });

  process.on('exit', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
  });

  worker.once('error', (err: Error) => {
    log('watchdog worker error', err);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
  });

  worker.once('exit', (code: number) => {
    log('watchdog worker exit', code);
  });

  // Ensure this thread can't block app exit
  worker.unref();
}

const _eventLoopBlockIntegration = ((options: Partial<ThreadBlockedIntegrationOptions> = {}) => {
  let polling: IntegrationInternal | undefined;

  return {
    name: INTEGRATION_NAME,
    async afterAllSetup(client: NodeClient): Promise<void> {
      const dsn = client.getDsn();

      if (!dsn) {
        log('No DSN configured, skipping starting integration');
        return;
      }

      try {
        polling = await startPolling(client, options);

        if (isMainThread) {
          await startWorker(dsn, client, options);
        }
      } catch (err) {
        log('Failed to start integration', err);
      }
    },
    start() {
      polling?.start();
    },
    stop() {
      polling?.stop();
    },
  } as Integration & IntegrationInternal;
}) satisfies IntegrationFn;

/**
 * Monitors the Node.js event loop for blocking behavior and reports blocked events to Sentry.
 *
 * Uses a background worker thread to detect when the main thread is blocked for longer than
 * the configured threshold (default: 1 second).
 *
 * When instrumenting via the `--import` flag, this integration will
 * automatically monitor all worker threads as well.
 *
 * ```js
 * // instrument.mjs
 * import * as Sentry from '@sentry/node';
 * import { eventLoopBlockIntegration } from '@sentry/node-native';
 *
 * Sentry.init({
 *   dsn: '__YOUR_DSN__',
 *   integrations: [
 *     eventLoopBlockIntegration({
 *       threshold: 500, // Report blocks longer than 500ms
 *     }),
 *   ],
 * });
 * ```
 *
 * Start your application with:
 * ```bash
 * node --import instrument.mjs app.mjs
 * ```
 */
export const eventLoopBlockIntegration = defineIntegration(_eventLoopBlockIntegration);

export function disableBlockDetectionForCallback<T>(callback: () => T): T;
export function disableBlockDetectionForCallback<T>(callback: () => Promise<T>): Promise<T>;
/**
 * Disables Event Loop Block detection for the current thread for the duration
 * of the callback.
 *
 * This utility function allows you to disable block detection during operations that
 * are expected to block the event loop, such as intensive computational tasks or
 * synchronous I/O operations.
 */
export function disableBlockDetectionForCallback<T>(callback: () => T | Promise<T>): T | Promise<T> {
  const integration = getClient()?.getIntegrationByName(INTEGRATION_NAME) as IntegrationInternal | undefined;

  if (!integration) {
    return callback();
  }

  integration.stop();

  const result = callback();
  if (isPromise(result)) {
    return result.finally(() => integration.start());
  }

  integration.start();
  return result;
}

/**
 * Pauses the block detection integration.
 *
 * This function pauses event loop block detection for the current thread.
 */
export function pauseEventLoopBlockDetection(): void {
  const integration = getClient()?.getIntegrationByName(INTEGRATION_NAME) as IntegrationInternal | undefined;

  if (!integration) {
    return;
  }

  integration.stop();
}

/**
 * Restarts the block detection integration.
 *
 * This function restarts event loop block detection for the current thread.
 */
export function restartEventLoopBlockDetection(): void {
  const integration = getClient()?.getIntegrationByName(INTEGRATION_NAME) as IntegrationInternal | undefined;

  if (!integration) {
    return;
  }

  integration.start();
}
