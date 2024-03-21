import { defineIntegration, getCurrentScope } from '@sentry/core';
import type { Contexts, Event, EventHint, IntegrationFn, IntegrationFnResult } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as inspector from 'inspector';
import { Worker } from 'worker_threads';
import { NODE_VERSION } from '../../nodeVersion';
import type { NodeClient } from '../../sdk/client';
import type { AnrIntegrationOptions, WorkerStartData } from './common';
import { base64WorkerScript } from './worker-script';

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

function log(message: string, ...args: unknown[]): void {
  logger.log(`[ANR] ${message}`, ...args);
}

/**
 * Gets contexts by calling all event processors. This relies on being called after all integrations are setup
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

const INTEGRATION_NAME = 'Anr';

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
    setup(initClient: NodeClient) {
      if (NODE_VERSION.major < 16 || (NODE_VERSION.major === 16 && NODE_VERSION.minor < 17)) {
        throw new Error('ANR detection requires Node 16.17.0 or later');
      }

      client = initClient;

      // setImmediate is used to ensure that all other integrations have had their setup called first.
      // This allows us to call into all integrations to fetch the full context
      setImmediate(() => this.startWorker());
    },
  } as IntegrationFnResult & AnrInternal;
}) satisfies IntegrationFn;

type AnrReturn = (options?: Partial<AnrIntegrationOptions>) => IntegrationFnResult & AnrInternal;

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
    captureStackTrace: !!integrationOptions.captureStackTrace,
    staticTags: integrationOptions.staticTags || {},
    contexts,
  };

  if (options.captureStackTrace) {
    if (!inspector.url()) {
      inspector.open(0);
    }
  }

  const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
    workerData: options,
  });

  process.on('exit', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
  });

  const timer = setInterval(() => {
    try {
      const currentSession = getCurrentScope().getSession();
      // We need to copy the session object and remove the toJSON method so it can be sent to the worker
      // serialized without making it a SerializedSession
      const session = currentSession ? { ...currentSession, toJSON: undefined } : undefined;
      // message the worker to tell it the main event loop is still running
      worker.postMessage({ session });
    } catch (_) {
      //
    }
  }, options.pollInterval);
  // Timer should not block exit
  timer.unref();

  worker.on('message', (msg: string) => {
    if (msg === 'session-ended') {
      log('ANR event sent from ANR worker. Clearing session in this thread.');
      getCurrentScope().setSession(undefined);
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
