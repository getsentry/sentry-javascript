import { captureEvent, captureSession, defineIntegration, getIsolationScope, updateSession } from '@sentry/core';
import type { Event, Integration, IntegrationFn, StackFrame } from '@sentry/types';
import { GLOBAL_OBJ, logger, normalizeUrlToBase, stripSentryFramesAndReverse } from '@sentry/utils';
import * as inspector from 'inspector';
import { Worker } from 'worker_threads';
import { getCurrentScope } from '../..';
import { NODE_VERSION } from '../../nodeVersion';
import type { NodeClient } from '../../sdk/client';
import type { AnrIntegrationOptions, WorkerStartData } from './common';
import { base64WorkerScript } from './worker-script';

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

function log(message: string, ...args: unknown[]): void {
  logger.log(`[ANR] ${message}`, ...args);
}

function globalWithScopeFetchFn(): typeof GLOBAL_OBJ & {
  __SENTRY_SEND_ANR__?: (frames: StackFrame[]) => void;
} {
  return GLOBAL_OBJ;
}

const INTEGRATION_NAME = 'Anr';

type AnrInternal = { startWorker: () => void; stopWorker: () => void };

const _anrIntegration = ((integrationOptions: Partial<AnrIntegrationOptions> = {}) => {
  if (NODE_VERSION.major < 16 || (NODE_VERSION.major === 16 && NODE_VERSION.minor < 17)) {
    throw new Error('ANR detection requires Node 16.17.0 or later');
  }

  const options: WorkerStartData = {
    debug: logger.isEnabled(),
    appRootPath: integrationOptions.appRootPath,
    pollInterval: integrationOptions.pollInterval || DEFAULT_INTERVAL,
    anrThreshold: integrationOptions.anrThreshold || DEFAULT_HANG_THRESHOLD,
    staticTags: integrationOptions.staticTags || {},
  };

  let worker: Promise<() => void> | undefined;
  let client: NodeClient | undefined;

  function prepareStackFrames(stackFrames: StackFrame[] | undefined): StackFrame[] | undefined {
    if (!stackFrames) {
      return undefined;
    }

    // Strip Sentry frames and reverse the stack frames so they are in the correct order
    const strippedFrames = stripSentryFramesAndReverse(stackFrames);

    // If we have an app root path, rewrite the filenames to be relative to the app root
    if (options.appRootPath) {
      for (const frame of strippedFrames) {
        if (!frame.filename) {
          continue;
        }

        frame.filename = normalizeUrlToBase(frame.filename, options.appRootPath);
      }
    }

    return strippedFrames;
  }

  function sendAnrEvent(frames?: StackFrame[]): void {
    const session = getIsolationScope().getSession();
    if (session) {
      log('Sending abnormal session');
      updateSession(session, { status: 'abnormal', abnormal_mechanism: 'anr_foreground' });
      captureSession();
    }

    log('Sending event');

    const event: Event = {
      level: 'error',
      exception: {
        values: [
          {
            type: 'ApplicationNotResponding',
            value: `Application Not Responding for at least ${options.anrThreshold} ms`,
            stacktrace: { frames: prepareStackFrames(frames) },
            // This ensures the UI doesn't say 'Crashed in' for the stack trace
            mechanism: { type: 'ANR' },
          },
        ],
      },
      tags: options.staticTags,
    };

    captureEvent(event);
  }

  // Hookup the scope fetch function to the global object so that it can be called from the worker thread via the
  // debugger when it pauses
  const gbl = globalWithScopeFetchFn();
  gbl.__SENTRY_SEND_ANR__ = sendAnrEvent;

  return {
    name: INTEGRATION_NAME,
    startWorker: () => {
      if (worker) {
        return;
      }

      if (client) {
        worker = _startWorker(options);
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
async function _startWorker(options: WorkerStartData): Promise<() => void> {
  if (!inspector.url()) {
    inspector.open(0);
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
      worker.postMessage({});
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
