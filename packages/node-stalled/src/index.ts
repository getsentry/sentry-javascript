import { types } from 'node:util';
import { Worker } from 'node:worker_threads';
import type { Contexts, Event, EventHint, Integration, IntegrationFn } from '@sentry/core';
import {
  defineIntegration,
  getClient,
  getFilenameToDebugIdMap,
  getIsolationScope,
  logger,
} from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import type { AnrIntegrationOptions, WorkerStartData } from './common';

const { isPromise } = types;

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

function log(message: string, ...args: unknown[]): void {
  logger.log(`[Node Stalled] ${message}`, ...args);
}

/**
 * Gets contexts by calling all event processors. This shouldn't be called until all integrations are setup
 */
async function getContexts(client: NodeClient): Promise<Contexts> {
  let event: Event | null = { message: 'ANR' };
  const eventHint: EventHint = {};

  for (const processor of client.getEventProcessors()) {
    if (event === null) break;
    event = await processor(event, eventHint);
  }

  return event?.contexts || {};
}

const INTEGRATION_NAME = 'NodeStalled';

type AnrInternal = { startWorker: () => void; stopWorker: () => void };

const _anrIntegration = ((options: Partial<AnrIntegrationOptions> = {}) => {
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
    async setup(initClient: NodeClient) {
      client = initClient;

      // setImmediate is used to ensure that all other integrations have had their setup called first.
      // This allows us to call into all integrations to fetch the full context
      setImmediate(() => this.startWorker());
    },
  } as Integration & AnrInternal;
}) satisfies IntegrationFn;

type AnrReturn = (options?: Partial<AnrIntegrationOptions>) => Integration & AnrInternal;

export const anrIntegration = defineIntegration(_anrIntegration) as AnrReturn;

/**
 * Starts the ANR worker thread
 *
 * @returns A function to stop the worker
 */
async function _startWorker(
  client: NodeClient,
  integrationOptions: Partial<AnrIntegrationOptions>,
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
    pollInterval: integrationOptions.pollInterval || DEFAULT_INTERVAL,
    anrThreshold: integrationOptions.anrThreshold || DEFAULT_HANG_THRESHOLD,
    maxAnrEvents: integrationOptions.maxAnrEvents || 1,
    staticTags: integrationOptions.staticTags || {},
    contexts,
  };

  const worker = new Worker(new URL('./worker', import.meta.url), {
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
      worker.postMessage({ session, debugImages: getFilenameToDebugIdMap(initOptions.stackParser) });
    } catch (_) {
      //
    }
  }, options.pollInterval);
  // Timer should not block exit
  timer.unref();

  worker.on('message', (msg: string) => {
    if (msg === 'session-ended') {
      log('ANR event sent from ANR worker. Clearing session in this thread.');
      getIsolationScope().setSession(undefined);
    }
  });

  worker.once('error', (err: Error) => {
    clearInterval(timer);
    log('ANR worker error', err);
  });

  worker.once('exit', (code: number) => {
    clearInterval(timer);
    log('ANR worker exit', code);
  });

  // Ensure this thread can't block app exit
  worker.unref();

  return () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
    clearInterval(timer);
  };
}

export function disableAnrDetectionForCallback<T>(callback: () => T): T;
export function disableAnrDetectionForCallback<T>(callback: () => Promise<T>): Promise<T>;
/**
 * Disables ANR detection for the duration of the callback
 */
export function disableAnrDetectionForCallback<T>(callback: () => T | Promise<T>): T | Promise<T> {
  const integration = getClient()?.getIntegrationByName(INTEGRATION_NAME) as AnrInternal | undefined;

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
