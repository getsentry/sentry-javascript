import { getClient, makeSession, updateSession } from '@sentry/core';
import type { Event, Session, StackFrame } from '@sentry/types';
import { createDebugPauseMessageHandler, dynamicRequire, logger, watchdogTimer } from '@sentry/utils';
import type { Session as InspectorSession } from 'inspector';

import type { MessagePort, Worker } from 'worker_threads';
import { addEventProcessor, captureEvent, flush, getCurrentHub, getModuleFromFilename } from '..';
import { NODE_VERSION } from '../nodeVersion';

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

interface Options {
  /**
   * The app entry script. This is used to run the same script as the ANR worker.
   *
   * Defaults to `process.argv[1]`.
   */
  entryScript: string;
  /**
   * Interval to send heartbeat messages to the ANR worker.
   *
   * Defaults to 50ms.
   */
  pollInterval: number;
  /**
   * Threshold in milliseconds to trigger an ANR event.
   *
   * Defaults to 5000ms.
   */
  anrThreshold: number;
  /**
   * Whether to capture a stack trace when the ANR event is triggered.
   *
   * Defaults to `false`.
   *
   * This uses the node debugger which enables the inspector API and opens the required ports.
   */
  captureStackTrace: boolean;
  /**
   * @deprecated Use 'init' debug option instead
   */
  debug: boolean;
}

function createAnrEvent(blockedMs: number, frames?: StackFrame[]): Event {
  return {
    level: 'error',
    exception: {
      values: [
        {
          type: 'ApplicationNotResponding',
          value: `Application Not Responding for at least ${blockedMs} ms`,
          stacktrace: { frames },
          mechanism: {
            // This ensures the UI doesn't say 'Crashed in' for the stack trace
            type: 'ANR',
          },
        },
      ],
    },
  };
}

type WorkerThreads = {
  Worker: typeof Worker;
  isMainThread: boolean;
  parentPort: null | MessagePort;
  workerData: { inspectorUrl?: string };
};

/**
 * We need to use dynamicRequire because worker_threads is not available in node < v12 and webpack error will when
 * targeting those versions
 */
function getWorkerThreads(): WorkerThreads {
  return dynamicRequire(module, 'worker_threads');
}

type InspectorSessionNodeV12 = InspectorSession & { connectToMainThread: () => void };

interface InspectorApi {
  open: (port: number) => void;
  url: () => string | undefined;
}

/**
 * Starts the node debugger and returns the inspector url.
 *
 * When inspector.url() returns undefined, it means the port is already in use so we try the next port.
 */
function startInspector(startPort: number = 9229): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const inspector: InspectorApi = require('inspector');
  let inspectorUrl: string | undefined = undefined;
  let port = startPort;

  while (inspectorUrl === undefined && port < startPort + 100) {
    inspector.open(port);
    inspectorUrl = inspector.url();
    port++;
  }

  return inspectorUrl;
}

function startAnrWorker(options: Options): void {
  const { Worker } = getWorkerThreads();

  function log(message: string, ...args: unknown[]): void {
    logger.log(`[ANR] ${message}`, ...args);
  }

  const hub = getCurrentHub();

  try {
    log(`Spawning worker with entryScript:'${options.entryScript}'`);

    const inspectorUrl = options.captureStackTrace ? startInspector() : undefined;
    const worker = new Worker(options.entryScript, { workerData: { inspectorUrl } });
    // The worker should not keep the main process alive
    worker.unref();

    const timer = setInterval(() => {
      try {
        const currentSession = hub.getScope()?.getSession();
        // We need to copy the session object and remove the toJSON method so it can be sent to the worker
        // serialized without making it a SerializedSession
        const session = currentSession ? { ...currentSession, toJSON: undefined } : undefined;
        // message the worker to tell it the main event loop is still running
        worker.postMessage({ session });
      } catch (_) {
        //
      }
    }, options.pollInterval);

    worker.on('message', (msg: string) => {
      if (msg === 'session-ended') {
        log('ANR event sent from ANR worker. Clearing session in this process.');
        hub.getScope()?.setSession(undefined);
      }
    });

    const end = (type: string): ((...args: unknown[]) => void) => {
      return (...args): void => {
        clearInterval(timer);
        log(`ANR worker ${type}`, ...args);
      };
    };

    worker.on('error', end('error'));
    worker.on('exit', end('exit'));
  } catch (e) {
    log('Failed to start worker', e);
  }
}

function createHrTimer(): { getTimeMs: () => number; reset: () => void } {
  let lastPoll = process.hrtime();

  return {
    getTimeMs: (): number => {
      const [seconds, nanoSeconds] = process.hrtime(lastPoll);
      return Math.floor(seconds * 1e3 + nanoSeconds / 1e6);
    },
    reset: (): void => {
      lastPoll = process.hrtime();
    },
  };
}

function handlerAnrWorker(options: Options): void {
  const { parentPort, workerData } = getWorkerThreads();

  let anrEventSent = false;

  function log(message: string): void {
    logger.log(`[ANR Worker] ${message}`);
  }

  log('Started');
  let session: Session | undefined;

  function sendAnrEvent(frames?: StackFrame[]): void {
    if (anrEventSent) {
      return;
    }

    anrEventSent = true;

    log('Sending ANR event');

    if (session) {
      log('Sending abnormal session');
      updateSession(session, { status: 'abnormal', abnormal_mechanism: 'anr_foreground' });
      getClient()?.sendSession(session);

      try {
        // Notify the main process that the session has ended so the session can be cleared from the scope
        parentPort?.postMessage('session-ended');
      } catch (_) {
        // ignore
      }
    }

    captureEvent(createAnrEvent(options.anrThreshold, frames));

    void flush(3000).then(() => {
      // We exit so we only capture one event to avoid spamming users with errors
      // We wait 5 seconds to ensure stdio has been flushed from the worker
      setTimeout(() => {
        process.exit();
      }, 5_000);
    });
  }

  addEventProcessor(event => {
    // Strip sdkProcessingMetadata from all ANR worker events to remove trace info
    delete event.sdkProcessingMetadata;
    event.tags = {
      ...event.tags,
      'process.name': 'ANR',
    };
    return event;
  });

  let debuggerPause: () => void | undefined;

  const { inspectorUrl } = workerData;

  // if attachStackTrace was enabled, we'll have a debugger url to connect to
  if (inspectorUrl) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Session } = require('inspector');
    log('Connecting to debugger');
    const session: InspectorSessionNodeV12 = new Session();
    session.connectToMainThread();

    const handler = createDebugPauseMessageHandler(
      cmd => session.post(cmd),
      getModuleFromFilename,
      frames => sendAnrEvent(frames),
    );

    session.on('inspectorNotification', params => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler(params as any);
    });

    debuggerPause = () => {
      session.post('Debugger.enable', () => {
        session.post('Debugger.pause');
      });
    };
  }

  async function watchdogTimeout(): Promise<void> {
    log('Watchdog timeout');

    try {
      if (debuggerPause) {
        log('Pausing debugger to capture stack trace');
        debuggerPause();
        return;
      }
    } catch (_) {
      // ignore
    }

    log('Capturing event');
    sendAnrEvent();
  }

  const { poll } = watchdogTimer(createHrTimer, options.pollInterval, options.anrThreshold, watchdogTimeout);

  parentPort?.on('message', (msg: { session: Session | undefined }) => {
    if (msg.session) {
      session = makeSession(msg.session);
    }

    poll();
  });
}

/**
 * Returns true if the current thread is the ANR worker.
 */
export function isAnrWorker(): boolean {
  try {
    const { isMainThread } = dynamicRequire(module, 'worker_threads') as WorkerThreads;
    return !isMainThread;
  } catch (_) {
    return false;
  }
}

/**
 * **Note** This feature is still in beta so there may be breaking changes in future releases.
 *
 * Starts a ANR worker that detects Application Not Responding (ANR) errors.
 *
 * It's important to await on the returned promise before your app code to ensure this code does not run in the
 * ANR worker.
 *
 * ```js
 * import { init, enableAnrDetection } from '@sentry/node';
 *
 * init({ dsn: "__DSN__" });
 *
 * // with ESM + Node 14+
 * await enableAnrDetection({ captureStackTrace: true });
 * runApp();
 *
 * // with CJS or Node 10+
 * enableAnrDetection({ captureStackTrace: true }).then(() => {
 *   runApp();
 * });
 * ```
 */
export function enableAnrDetection(options: Partial<Options>): Promise<void> {
  if ((NODE_VERSION.major || 0) < 12 || ((NODE_VERSION.major || 0) === 12 && (NODE_VERSION.minor || 0) < 11)) {
    throw new Error('ANR detection requires Node 12.11.0 or later');
  }

  // When pm2 runs the script in cluster mode, process.argv[1] is the pm2 script and process.env.pm_exec_path is the
  // path to the entry script
  const entryScript = options.entryScript || process.env.pm_exec_path || process.argv[1];

  const anrOptions: Options = {
    entryScript,
    pollInterval: options.pollInterval || DEFAULT_INTERVAL,
    anrThreshold: options.anrThreshold || DEFAULT_HANG_THRESHOLD,
    captureStackTrace: !!options.captureStackTrace,
    // eslint-disable-next-line deprecation/deprecation
    debug: !!options.debug,
  };

  if (isAnrWorker()) {
    handlerAnrWorker(anrOptions);
    // In the ANR worker, the promise never resolves which stops the app code from running
    return new Promise<void>(() => {
      // Never resolve
    });
  } else {
    startAnrWorker(anrOptions);
    // In the main process, the promise resolves immediately
    return Promise.resolve();
  }
}
