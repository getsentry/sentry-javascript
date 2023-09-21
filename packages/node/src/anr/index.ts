import type { Event, StackFrame } from '@sentry/types';
import { watchdogTimer } from '@sentry/utils';
import { fork } from 'child_process';
import * as inspector from 'inspector';

import { addGlobalEventProcessor, captureEvent, flush } from '..';
import { captureStackTrace } from './debugger';

const DEFAULT_INTERVAL = 50;
const DEFAULT_HANG_THRESHOLD = 5000;

interface Options {
  /**
   * The app entry script. This is used to run the same script as the child process.
   *
   * Defaults to `process.argv[1]`.
   */
  entryScript: string;
  /**
   * Interval to send alive messages to the child process.
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
  const env = { ...process.env };

  if (options.captureStackTrace) {
    inspector.open();
    env.SENTRY_INSPECT_URL = inspector.url();
  }

  const child = fork(options.entryScript, {
    env,
    stdio: options.debug ? 'inherit' : 'ignore',
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

  child.on('error', () => {
    clearTimeout(timer);
  });
  child.on('disconnect', () => {
    clearTimeout(timer);
  });
  child.on('exit', () => {
    clearTimeout(timer);
  });
}

function handleChildProcess(options: Options): void {
  addGlobalEventProcessor(event => {
    // Strip sdkProcessingMetadata from all child process events to remove trace info
    delete event.sdkProcessingMetadata;
    return event;
  });

  let debuggerPause: Promise<() => void> | undefined;

  // if attachStackTrace is enabled, we'll have a debugger url to connect to
  if (process.env.SENTRY_INSPECT_URL) {
    debuggerPause = captureStackTrace(process.env.SENTRY_INSPECT_URL, frames => {
      sendEvent(options.anrThreshold, frames);
    });
  }

  async function watchdogTimeout(): Promise<void> {
    const pauseAndCapture = await debuggerPause;

    if (pauseAndCapture) {
      pauseAndCapture();
    } else {
      sendEvent(options.anrThreshold);
    }
  }

  const ping = watchdogTimer(options.pollInterval, options.anrThreshold, watchdogTimeout);

  process.on('message', () => {
    ping();
  });
}

/**
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
 * // with ESM
 * await enableAnrDetection({ captureStackTrace: true });
 * runApp();
 *
 * // with CJS
 * enableAnrDetection({ captureStackTrace: true }).then(() => {
 *   runApp();
 * });
 * ```
 */
export function enableAnrDetection(options: Partial<Options>): Promise<void> {
  const isChildProcess = !!process.send;

  const anrOptions: Options = {
    entryScript: options.entryScript || process.argv[1],
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
