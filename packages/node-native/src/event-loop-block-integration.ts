import { types } from 'node:util';
import { Worker } from 'node:worker_threads';
import type { Contexts, Event, EventHint, Integration, IntegrationFn } from '@sentry/core';
import { defineIntegration, getClient, getFilenameToDebugIdMap, getIsolationScope, logger } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { registerThread, threadPoll } from '@sentry-internal/node-native-stacktrace';
import type { ThreadBlockedIntegrationOptions, WorkerStartData } from './common';
import { POLL_RATIO } from './common';

const { isPromise } = types;

const DEFAULT_THRESHOLD = 1_000;

function log(message: string, ...args: unknown[]): void {
  logger.log(`[Thread Blocked] ${message}`, ...args);
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

const INTEGRATION_NAME = 'ThreadBlocked';

type ThreadBlockedInternal = { startWorker: () => void; stopWorker: () => void };

const _eventLoopBlockIntegration = ((options: Partial<ThreadBlockedIntegrationOptions> = {}) => {
  let worker: Promise<() => void> | undefined;
  let client: NodeClient | undefined;

  return {
    name: INTEGRATION_NAME,
    startWorker: () => {
      if (worker) {
        return;
      }

      if (client) {
        worker = _startWorker(client, options);
      }
    },
    stopWorker: () => {
      if (worker) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        worker.then(stop => {
          stop();
          worker = undefined;
        });
      }
    },
    async afterAllSetup(initClient: NodeClient) {
      client = initClient;

      registerThread();

      this.startWorker();
    },
  } as Integration & ThreadBlockedInternal;
}) satisfies IntegrationFn;

type ThreadBlockedReturn = (options?: Partial<ThreadBlockedIntegrationOptions>) => Integration & ThreadBlockedInternal;

/**
 * Monitors the Node.js event loop for blocking behavior and reports blocked events to Sentry.
 *
 * Uses a background worker thread to detect when the main thread is blocked for longer than
 * the configured threshold (default: 5 seconds).
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
export const eventLoopBlockIntegration = defineIntegration(_eventLoopBlockIntegration) as ThreadBlockedReturn;

/**
 * Starts the worker thread
 *
 * @returns A function to stop the worker
 */
async function _startWorker(
  client: NodeClient,
  integrationOptions: Partial<ThreadBlockedIntegrationOptions>,
): Promise<() => void> {
  const dsn = client.getDsn();

  if (!dsn) {
    return () => {
      //
    };
  }

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
    threshold: integrationOptions.threshold || DEFAULT_THRESHOLD,
    maxBlockedEvents: integrationOptions.maxBlockedEvents || 1,
    staticTags: integrationOptions.staticTags || {},
    contexts,
  };

  const pollInterval = options.threshold / POLL_RATIO

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

  const timer = setInterval(() => {
    try {
      const currentSession = getIsolationScope().getSession();
      // We need to copy the session object and remove the toJSON method so it can be sent to the worker
      // serialized without making it a SerializedSession
      const session = currentSession ? { ...currentSession, toJSON: undefined } : undefined;
      // message the worker to tell it the main event loop is still running
      threadPoll({ session, debugImages: getFilenameToDebugIdMap(initOptions.stackParser) });
    } catch (_) {
      //
    }
  }, pollInterval);
  // Timer should not block exit
  timer.unref();

  worker.once('error', (err: Error) => {
    clearInterval(timer);
    log('watchdog worker error', err);
  });

  worker.once('exit', (code: number) => {
    clearInterval(timer);
    log('watchdog worker exit', code);
  });

  // Ensure this thread can't block app exit
  worker.unref();

  return () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
    clearInterval(timer);
  };
}

export function disableBlockedDetectionForCallback<T>(callback: () => T): T;
export function disableBlockedDetectionForCallback<T>(callback: () => Promise<T>): Promise<T>;
/**
 * Disables blocked detection for the duration of the callback
 */
export function disableBlockedDetectionForCallback<T>(callback: () => T | Promise<T>): T | Promise<T> {
  const integration = getClient()?.getIntegrationByName(INTEGRATION_NAME) as ThreadBlockedInternal | undefined;

  if (!integration) {
    return callback();
  }

  integration.stopWorker();

  const result = callback();
  if (isPromise(result)) {
    return result.finally(() => integration.startWorker());
  }

  integration.startWorker();
  return result;
}
