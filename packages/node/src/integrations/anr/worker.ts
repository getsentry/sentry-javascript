import { callFrameToStackFrame, watchdogTimer } from '@sentry/utils';
import { Session as InspectorSession } from 'inspector';
import { parentPort, workerData } from 'worker_threads';

import { createGetModuleFromFilename } from '../../utils/module';
import type { WorkerStartData } from './common';

type VoidFunction = () => void;

const options: WorkerStartData = workerData;

function log(msg: string): void {
  if (options.debug) {
    // eslint-disable-next-line no-console
    console.log(`[ANR Worker] ${msg}`);
  }
}

log('Started. Connecting to debugger');

const session = new InspectorSession();
session.connectToMainThread();

log('Connected to debugger');

// Collect scriptId -> url map so we can look up the filenames later
const scripts = new Map<string, string>();

session.on('Debugger.scriptParsed', event => {
  scripts.set(event.params.scriptId, event.params.url);
});

session.on('Debugger.paused', event => {
  if (event.params.reason !== 'other') {
    return;
  }

  try {
    log('Debugger paused');

    // copy the frames
    const callFrames = [...event.params.callFrames];

    const getModuleName = options.appRootPath ? createGetModuleFromFilename(options.appRootPath) : () => undefined;
    const stackFrames = callFrames.map(frame =>
      callFrameToStackFrame(frame, scripts.get(frame.location.scriptId), getModuleName),
    );

    // Evaluate a script in the currently paused context
    session.post(
      'Runtime.evaluate',
      {
        // Send the stack frames to the main thread to be sent by the SDK
        expression: `await global.__SENTRY_SEND_ANR__(${JSON.stringify(stackFrames)});`,
        // Don't re-trigger the debugger if this causes an error
        silent: true,
        // Serialize the result to json otherwise only primitives are supported
        returnByValue: true,
      },
      err => {
        if (err) {
          log(`Error executing script: '${err.message}'`);
        }

        session.post('Debugger.resume');
        session.post('Debugger.disable');
      },
    );
  } catch (e) {
    session.post('Debugger.resume');
    session.post('Debugger.disable');
    throw e;
  }
});

const debuggerPause = (): void => {
  try {
    session.post('Debugger.enable', () => {
      session.post('Debugger.pause');
    });
  } catch (_) {
    //
  }
};

function createHrTimer(): { getTimeMs: () => number; reset: VoidFunction } {
  // TODO (v8): We can use process.hrtime.bigint() after we drop node v8
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

function watchdogTimeout(): void {
  log('Watchdog timeout');

  log('Pausing debugger to capture stack trace');
  debuggerPause();
}

const { poll } = watchdogTimer(createHrTimer, options.pollInterval, options.anrThreshold, watchdogTimeout);

parentPort?.on('message', () => {
  poll();
});
