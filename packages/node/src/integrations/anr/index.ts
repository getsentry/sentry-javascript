// TODO (v8): This import can be removed once we only support Node with global URL
import { URL } from 'url';
import { convertIntegrationFnToClass, getCurrentScope } from '@sentry/core';
import type { Contexts, Event, EventHint, IntegrationFn } from '@sentry/types';
import { dynamicRequire, logger } from '@sentry/utils';
import type { Worker, WorkerOptions } from 'worker_threads';
import type { NodeClient } from '../../client';
import { NODE_VERSION } from '../../nodeVersion';
import type { Options, WorkerStartData } from './common';
import { base64WorkerScript } from './worker-script';

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

type WorkerNodeV14 = Worker & { new (filename: string | URL, options?: WorkerOptions): Worker };

type WorkerThreads = {
  Worker: WorkerNodeV14;
};

function log(message: string, ...args: unknown[]): void {
  logger.log(`[ANR] ${message}`, ...args);
}

/**
 * We need to use dynamicRequire because worker_threads is not available in node < v12 and webpack error will when
 * targeting those versions
 */
function getWorkerThreads(): WorkerThreads {
  return dynamicRequire(module, 'worker_threads');
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

interface InspectorApi {
  open: (port: number) => void;
  url: () => string | undefined;
}

const INTEGRATION_NAME = 'Anr';

const anrIntegration = ((options: Partial<Options> = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      if (NODE_VERSION.major < 16) {
        throw new Error('ANR detection requires Node 16 or later');
      }

      // setImmediate is used to ensure that all other integrations have been setup
      setImmediate(() => _startWorker(client, options));
    },
  };
}) satisfies IntegrationFn;

/**
 * Starts a thread to detect App Not Responding (ANR) events
 */
// eslint-disable-next-line deprecation/deprecation
export const Anr = convertIntegrationFnToClass(INTEGRATION_NAME, anrIntegration);

/**
 * Starts the ANR worker thread
 */
async function _startWorker(client: NodeClient, _options: Partial<Options>): Promise<void> {
  const contexts = await getContexts(client);
  const dsn = client.getDsn();

  if (!dsn) {
    return;
  }

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
    environment: initOptions.environment || 'production',
    release: initOptions.release,
    dist: initOptions.dist,
    sdkMetadata,
    appRootPath: _options.appRootPath,
    pollInterval: _options.pollInterval || DEFAULT_INTERVAL,
    anrThreshold: _options.anrThreshold || DEFAULT_HANG_THRESHOLD,
    captureStackTrace: !!_options.captureStackTrace,
    staticTags: _options.staticTags || {},
    contexts,
  };

  if (options.captureStackTrace) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const inspector: InspectorApi = require('inspector');
    if (!inspector.url()) {
      inspector.open(0);
    }
  }

  const { Worker } = getWorkerThreads();

  const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
    workerData: options,
  });
  // Ensure this thread can't block app exit
  worker.unref();

  process.on('exit', () => {
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
}
