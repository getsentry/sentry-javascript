import { spawn } from 'child_process';
import { getClient, getCurrentScope, makeSession, updateSession } from '@sentry/core';
import type { Event, Session, StackFrame } from '@sentry/types';
import { logger, watchdogTimer } from '@sentry/utils';

import { addEventProcessor, captureEvent, flush } from '..';
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

function startChildProcess(options: Options): void {
  function log(message: string, ...args: unknown[]): void {
    logger.log(`[ANR] ${message}`, ...args);
  }

  try {
    const env = { ...process.env };
    env.SENTRY_ANR_CHILD_PROCESS = 'true';

    if (options.captureStackTrace) {
      env.SENTRY_INSPECT_URL = startInspector();
    }

    log(`Spawning child process with execPath:'${process.execPath}' and entryScript:'${options.entryScript}'`);

    const child = spawn(process.execPath, [options.entryScript], {
      env,
      stdio: logger.isEnabled() ? ['inherit', 'inherit', 'inherit', 'ipc'] : ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    // The child process should not keep the main process alive
    child.unref();

    const timer = setInterval(() => {
      try {
        const currentSession = getCurrentScope()?.getSession();
        // We need to copy the session object and remove the toJSON method so it can be sent to the child process
        // serialized without making it a SerializedSession
        const session = currentSession ? { ...currentSession, toJSON: undefined } : undefined;
        // message the child process to tell it the main event loop is still running
        child.send({ session });
      } catch (_) {
        //
      }
    }, options.pollInterval);

    child.on('message', (msg: string) => {
      if (msg === 'session-ended') {
        log('ANR event sent from child process. Clearing session in this process.');
        getCurrentScope()?.setSession(undefined);
      }
    });

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

function handleChildProcess(options: Options): void {
  process.title = 'sentry-anr';

  function log(message: string): void {
    logger.log(`[ANR child process] ${message}`);
  }

  log('Started');
  let session: Session | undefined;

  function sendAnrEvent(frames?: StackFrame[]): void {
    if (session) {
      log('Sending abnormal session');
      updateSession(session, { status: 'abnormal', abnormal_mechanism: 'anr_foreground' });
      getClient()?.sendSession(session);

      try {
        // Notify the main process that the session has ended so the session can be cleared from the scope
        process.send?.('session-ended');
      } catch (_) {
        // ignore
      }
    }

    captureEvent(createAnrEvent(options.anrThreshold, frames));

    void flush(3000).then(() => {
      // We only capture one event to avoid spamming users with errors
      process.exit();
    });
  }

  addEventProcessor(event => {
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
      sendAnrEvent(frames);
    });
  }

  async function watchdogTimeout(): Promise<void> {
    log('Watchdog timeout');

    try {
      const pauseAndCapture = await debuggerPause;

      if (pauseAndCapture) {
        log('Pausing debugger to capture stack trace');
        pauseAndCapture();
        return;
      }
    } catch (_) {
      // ignore
    }

    log('Capturing event');
    sendAnrEvent();
  }

  const { poll } = watchdogTimer(createHrTimer, options.pollInterval, options.anrThreshold, watchdogTimeout);

  process.on('message', (msg: { session: Session | undefined }) => {
    if (msg.session) {
      session = makeSession(msg.session);
    }
    poll();
  });
  process.on('disconnect', () => {
    // Parent process has exited.
    process.exit();
  });
}

/**
 * Returns true if the current process is an ANR child process.
 */
export function isAnrChildProcess(): boolean {
  return !!process.send && !!process.env.SENTRY_ANR_CHILD_PROCESS;
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

  if (isAnrChildProcess()) {
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
