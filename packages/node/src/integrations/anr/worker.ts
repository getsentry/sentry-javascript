import { Session as InspectorSession } from 'node:inspector';
import { parentPort, workerData } from 'node:worker_threads';
import type { DebugImage, Event, ScopeData, Session, StackFrame } from '@sentry/core';
import {
  applyScopeDataToEvent,
  callFrameToStackFrame,
  createEventEnvelope,
  createSessionEnvelope,
  getEnvelopeEndpointWithUrlEncodedAuth,
  makeSession,
  normalizeUrlToBase,
  stripSentryFramesAndReverse,
  updateSession,
  uuid4,
  watchdogTimer,
} from '@sentry/core';

import { makeNodeTransport } from '../../transports';
import { createGetModuleFromFilename } from '../../utils/module';
import type { WorkerStartData } from './common';

type VoidFunction = () => void;

const options: WorkerStartData = workerData;
let session: Session | undefined;
let hasSentAnrEvent = false;
let mainDebugImages: Record<string, string> = {};

function log(msg: string): void {
  if (options.debug) {
    // eslint-disable-next-line no-console
    console.log(`[ANR Worker] ${msg}`);
  }
}

const url = getEnvelopeEndpointWithUrlEncodedAuth(options.dsn, options.tunnel, options.sdkMetadata.sdk);
const transport = makeNodeTransport({
  url,
  recordDroppedEvent: () => {
    //
  },
});

async function sendAbnormalSession(): Promise<void> {
  // of we have an existing session passed from the main thread, send it as abnormal
  if (session) {
    log('Sending abnormal session');
    updateSession(session, { status: 'abnormal', abnormal_mechanism: 'anr_foreground' });

    const envelope = createSessionEnvelope(session, options.dsn, options.sdkMetadata, options.tunnel);
    // Log the envelope so to aid in testing
    log(JSON.stringify(envelope));

    await transport.send(envelope);

    try {
      // Notify the main process that the session has ended so the session can be cleared from the scope
      parentPort?.postMessage('session-ended');
    } catch (_) {
      // ignore
    }
  }
}

log('Started');

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

function applyDebugMeta(event: Event): void {
  if (Object.keys(mainDebugImages).length === 0) {
    return;
  }

  const filenameToDebugId = new Map<string, string>();

  for (const exception of event.exception?.values || []) {
    for (const frame of exception.stacktrace?.frames || []) {
      const filename = frame.abs_path || frame.filename;
      if (filename && mainDebugImages[filename]) {
        filenameToDebugId.set(filename, mainDebugImages[filename] as string);
      }
    }
  }

  if (filenameToDebugId.size > 0) {
    const images: DebugImage[] = [];
    for (const [filename, debugId] of filenameToDebugId.entries()) {
      images.push({
        type: 'sourcemap',
        code_file: filename,
        debug_id: debugId,
      });
    }
    event.debug_meta = { images };
  }
}

function applyScopeToEvent(event: Event, scope: ScopeData): void {
  applyScopeDataToEvent(event, scope);

  if (!event.contexts?.trace) {
    // TODO(v9): Use generateSpanId() instead of spanId
    // eslint-disable-next-line deprecation/deprecation
    const { traceId, spanId, parentSpanId } = scope.propagationContext;
    event.contexts = {
      trace: {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId,
      },
      ...event.contexts,
    };
  }
}

async function sendAnrEvent(frames?: StackFrame[], scope?: ScopeData): Promise<void> {
  if (hasSentAnrEvent) {
    return;
  }

  hasSentAnrEvent = true;

  await sendAbnormalSession();

  log('Sending event');

  const event: Event = {
    event_id: uuid4(),
    contexts: options.contexts,
    release: options.release,
    environment: options.environment,
    dist: options.dist,
    platform: 'node',
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

  if (scope) {
    applyScopeToEvent(event, scope);
  }

  applyDebugMeta(event);

  const envelope = createEventEnvelope(event, options.dsn, options.sdkMetadata, options.tunnel);
  // Log the envelope to aid in testing
  log(JSON.stringify(envelope));

  await transport.send(envelope);
  await transport.flush(2000);

  // Delay for 5 seconds so that stdio can flush if the main event loop ever restarts.
  // This is mainly for the benefit of logging or debugging.
  setTimeout(() => {
    process.exit(0);
  }, 5_000);
}

let debuggerPause: VoidFunction | undefined;

if (options.captureStackTrace) {
  log('Connecting to debugger');

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

      // Runtime.evaluate may never return if the event loop is blocked indefinitely
      // In that case, we want to send the event anyway
      const getScopeTimeout = setTimeout(() => {
        sendAnrEvent(stackFrames).then(null, () => {
          log('Sending ANR event failed.');
        });
      }, 5_000);

      // Evaluate a script in the currently paused context
      session.post(
        'Runtime.evaluate',
        {
          // Grab the trace context from the current scope
          expression: 'global.__SENTRY_GET_SCOPES__();',
          // Don't re-trigger the debugger if this causes an error
          silent: true,
          // Serialize the result to json otherwise only primitives are supported
          returnByValue: true,
        },
        (err, param) => {
          if (err) {
            log(`Error executing script: '${err.message}'`);
          }

          clearTimeout(getScopeTimeout);

          const scopes = param && param.result ? (param.result.value as ScopeData) : undefined;

          session.post('Debugger.resume');
          session.post('Debugger.disable');

          sendAnrEvent(stackFrames, scopes).then(null, () => {
            log('Sending ANR event failed.');
          });
        },
      );
    } catch (e) {
      session.post('Debugger.resume');
      session.post('Debugger.disable');
      throw e;
    }
  });

  debuggerPause = () => {
    try {
      session.post('Debugger.enable', () => {
        session.post('Debugger.pause');
      });
    } catch (_) {
      //
    }
  };
}

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

  if (debuggerPause) {
    log('Pausing debugger to capture stack trace');
    debuggerPause();
  } else {
    log('Capturing event without a stack trace');
    sendAnrEvent().then(null, () => {
      log('Sending ANR event failed on watchdog timeout.');
    });
  }
}

const { poll } = watchdogTimer(createHrTimer, options.pollInterval, options.anrThreshold, watchdogTimeout);

parentPort?.on('message', (msg: { session: Session | undefined; debugImages?: Record<string, string> }) => {
  if (msg.session) {
    session = makeSession(msg.session);
  }

  if (msg.debugImages) {
    mainDebugImages = msg.debugImages;
  }

  poll();
});
