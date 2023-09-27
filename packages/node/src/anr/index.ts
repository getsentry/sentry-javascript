import type { Event, StackFrame } from '@sentry/types';
import { logger } from '@sentry/utils';
import { spawn } from 'child_process';
import * as inspector from 'inspector';

import { addGlobalEventProcessor, captureEvent, flush } from '..';
import { captureStackTrace } from './debugger';

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

/**
 * A node.js watchdog timer
 * @param pollInterval The interval that we expect to get polled at
 * @param anrThreshold The threshold for when we consider ANR
 * @param callback The callback to call for ANR
 * @returns A function to call to reset the timer
 */
function watchdogTimer(pollInterval: number, anrThreshold: number, callback: () => void): () => void {
  let lastPoll = process.hrtime();
  let triggered = false;

  setInterval(() => {
    const [seconds, nanoSeconds] = process.hrtime(lastPoll);
    const diffMs = Math.floor(seconds * 1e3 + nanoSeconds / 1e6);

    if (triggered === false && diffMs > pollInterval + anrThreshold) {
      triggered = true;
      callback();
    }

    if (diffMs < pollInterval + anrThreshold) {
      triggered = false;
    }
  }, 20);

  return () => {
    lastPoll = process.hrtime();
  };
}

interface Options {
  /**
   * The app entry script. This is used to run the same script as the child process.
   *
   * Defaults to `process.argv[1]`.
   */
  entryScript: string;
  /**
   * Interval to send heartbeat messages to the child process.
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
   * Log debug information.
   */
  debug: boolean;
}

function sendEvent(blockedMs: number, frames?: StackFrame[]): void {
  const event: Event = {
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

  captureEvent(event);

  void flush(3000).then(() => {
    // We only capture one event to avoid spamming users with errors
    process.exit();
  });
}

function startChildProcess(options: Options): void {
  function log(message: string, ...args: unknown[]): void {
    if (options.debug) {
      logger.log(`[ANR] ${message}`, ...args);
    }
  }

  process.title = 'sentry-anr-process';

  try {
    const env = { ...process.env };
    env.SENTRY_ANR_CHILD_PROCESS = 'true';

    if (options.captureStackTrace) {
      inspector.open();
      env.SENTRY_INSPECT_URL = inspector.url();
    }

    log(`Starting child process with execPath:'${process.execPath}' and entryScript'${options.entryScript}'`);

    const child = spawn(process.execPath, [options.entryScript], {
      env,
      stdio: options.debug ? ['inherit', 'inherit', 'inherit', 'ipc'] : ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    // The child process should not keep the main process alive
    child.unref();

    const timer = setInterval(() => {
      try {
        // message the child process to tell it the main event loop is still running
        child.send('ping');
      } catch (_) {
        //
      }
    }, options.pollInterval);

    const end = (type: string): ((...args: unknown[]) => void) => {
      return (...args): void => {
        clearInterval(timer);
        log(`Child process ${type}`, ...args);
      };
    };

    child.on('error', end('error'));
    child.on('disconnect', end('disconnect'));
    child.on('exit', end('exit'));
  } catch (e) {
    log('Failed to start child process', e);
  }
}

function handleChildProcess(options: Options): void {
  function log(message: string): void {
    if (options.debug) {
      logger.log(`[ANR child process] ${message}`);
    }
  }

  log('Started');

  addGlobalEventProcessor(event => {
    // Strip sdkProcessingMetadata from all child process events to remove trace info
    delete event.sdkProcessingMetadata;
    event.tags = {
      ...event.tags,
      'process.name': 'ANR',
    };
    return event;
  });

  let debuggerPause: Promise<() => void> | undefined;

  // if attachStackTrace is enabled, we'll have a debugger url to connect to
  if (process.env.SENTRY_INSPECT_URL) {
    log('Connecting to debugger');

    debuggerPause = captureStackTrace(process.env.SENTRY_INSPECT_URL, frames => {
      log('Capturing event with stack frames');
      sendEvent(options.anrThreshold, frames);
    });
  }

  async function watchdogTimeout(): Promise<void> {
    log('Watchdog timeout');
    const pauseAndCapture = await debuggerPause;

    if (pauseAndCapture) {
      log('Pausing debugger to capture stack trace');
      pauseAndCapture();
    } else {
      log('Capturing event');
      sendEvent(options.anrThreshold);
    }
  }

  const ping = watchdogTimer(options.pollInterval, options.anrThreshold, watchdogTimeout);

  process.on('message', () => {
    ping();
  });
}

/**
 * **Note** This feature is still in beta so there may be breaking changes in future releases.
 *
 * Starts a child process that detects Application Not Responding (ANR) errors.
 *
 * It's important to await on the returned promise before your app code to ensure this code does not run in the ANR
 * child process.
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
  const isChildProcess = !!process.send && !!process.env.SENTRY_ANR_CHILD_PROCESS;

  // When pm2 runs the script in cluster mode, process.argv[1] is the pm2 script and process.env.pm_exec_path is the
  // path to the entry script
  const entryScript = options.entryScript || process.env.pm_exec_path || process.argv[1];

  const anrOptions: Options = {
    entryScript,
    pollInterval: options.pollInterval || DEFAULT_INTERVAL,
    anrThreshold: options.anrThreshold || DEFAULT_HANG_THRESHOLD,
    captureStackTrace: !!options.captureStackTrace,
    debug: !!options.debug,
  };

  if (isChildProcess) {
    handleChildProcess(anrOptions);
    // In the child process, the promise never resolves which stops the app code from running
    return new Promise<void>(() => {
      // Never resolve
    });
  } else {
    startChildProcess(anrOptions);
    // In the main process, the promise resolves immediately
    return Promise.resolve();
  }
}
