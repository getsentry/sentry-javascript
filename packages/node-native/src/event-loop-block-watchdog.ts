import { workerData } from 'node:worker_threads';
import type { DebugImage, Event, Session, StackFrame, Thread } from '@sentry/core';
import {
  createEventEnvelope,
  createSessionEnvelope,
  filenameIsInApp,
  getEnvelopeEndpointWithUrlEncodedAuth,
  makeSession,
  normalizeUrlToBase,
  stripSentryFramesAndReverse,
  updateSession,
  uuid4,
} from '@sentry/core';
import { makeNodeTransport } from '@sentry/node';
import { captureStackTrace, getThreadsLastSeen } from '@sentry-internal/node-native-stacktrace';
import type { ThreadState, WorkerStartData } from './common';
import { POLL_RATIO } from './common';

const {
  threshold,
  appRootPath,
  contexts,
  debug,
  dist,
  dsn,
  environment,
  maxBlockedEvents,
  release,
  sdkMetadata,
  staticTags: tags,
  tunnel,
} = workerData as WorkerStartData;

const pollInterval = threshold / POLL_RATIO
const triggeredThreads = new Set<string>();
let sentAnrEvents = 0;

function log(...msg: unknown[]): void {
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[Sentry Blocked Watchdog]', ...msg);
  }
}

const url = getEnvelopeEndpointWithUrlEncodedAuth(dsn, tunnel, sdkMetadata.sdk);
const transport = makeNodeTransport({
  url,
  recordDroppedEvent: () => {
    //
  },
});

async function sendAbnormalSession(serializedSession: Session | undefined): Promise<void> {
  if (!serializedSession) {
    return;
  }

  log('Sending abnormal session');
  const session = makeSession(serializedSession);

  updateSession(session, {
    status: 'abnormal',
    abnormal_mechanism: 'anr_foreground',
    release,
    environment,
  });

  const envelope = createSessionEnvelope(session, dsn, sdkMetadata, tunnel);
  // Log the envelope so to aid in testing
  log(JSON.stringify(envelope));

  await transport.send(envelope);
}

log('Started');

function prepareStackFrames(stackFrames: StackFrame[] | undefined): StackFrame[] | undefined {
  if (!stackFrames) {
    return undefined;
  }

  // Strip Sentry frames and reverse the stack frames so they are in the correct order
  const strippedFrames = stripSentryFramesAndReverse(stackFrames);

  for (const frame of strippedFrames) {
    if (!frame.filename) {
      continue;
    }

    frame.in_app = filenameIsInApp(frame.filename);

    // If we have an app root path, rewrite the filenames to be relative to the app root
    if (appRootPath) {
      frame.filename = normalizeUrlToBase(frame.filename, appRootPath);
    }
  }

  return strippedFrames;
}

function stripFileProtocol(filename: string | undefined): string | undefined {
  if (!filename) {
    return undefined;
  }
  return filename.replace(/^file:\/\//, '');
}

// eslint-disable-next-line complexity
function applyDebugMeta(event: Event, debugImages: Record<string, string>): void {
  if (Object.keys(debugImages).length === 0) {
    return;
  }

  const normalisedDebugImages = appRootPath ? {} : debugImages;
  if (appRootPath) {
    for (const [path, debugId] of Object.entries(debugImages)) {
      normalisedDebugImages[normalizeUrlToBase(path, appRootPath)] = debugId;
    }
  }

  const filenameToDebugId = new Map<string, string>();

  for (const exception of event.exception?.values || []) {
    for (const frame of exception.stacktrace?.frames || []) {
      const filename = stripFileProtocol(frame.abs_path || frame.filename);
      if (filename && normalisedDebugImages[filename]) {
        filenameToDebugId.set(filename, normalisedDebugImages[filename] as string);
      }
    }
  }

  for (const thread of event.threads?.values || []) {
    for (const frame of thread.stacktrace?.frames || []) {
      const filename = stripFileProtocol(frame.abs_path || frame.filename);
      if (filename && normalisedDebugImages[filename]) {
        filenameToDebugId.set(filename, normalisedDebugImages[filename] as string);
      }
    }
  }

  if (filenameToDebugId.size > 0) {
    const images: DebugImage[] = [];
    for (const [code_file, debug_id] of filenameToDebugId.entries()) {
      images.push({
        type: 'sourcemap',
        code_file,
        debug_id,
      });
    }
    event.debug_meta = { images };
  }
}

function getExceptionAndThreads(
  crashedThreadId: string,
  threads: ReturnType<typeof captureStackTrace<ThreadState>>,
): Event {
  const crashedThread = threads[crashedThreadId];

  return {
    exception: {
      values: [
        {
          type: 'EventLoopBlocked',
          value: `Event Loop Blocked for at least ${threshold} ms`,
          stacktrace: { frames: prepareStackFrames(crashedThread?.frames) },
          // This ensures the UI doesn't say 'Crashed in' for the stack trace
          mechanism: { type: 'ANR' },
          thread_id: crashedThreadId,
        },
      ],
    },
    threads: {
      values: Object.entries(threads).map(([threadId, threadState]) => {
        const crashed = threadId === crashedThreadId;

        const thread: Thread = {
          id: threadId,
          name: threadId === '0' ? 'main' : `worker-${threadId}`,
          crashed,
          current: true,
          main: threadId === '0',
        };

        if (!crashed) {
          thread.stacktrace = { frames: prepareStackFrames(threadState.frames) };
        }

        return thread;
      }),
    },
  };
}

async function sendAnrEvent(crashedThreadId: string): Promise<void> {
  if (sentAnrEvents >= maxBlockedEvents) {
    return;
  }

  sentAnrEvents += 1;

  const threads = captureStackTrace<ThreadState>();
  const crashedThread = threads[crashedThreadId];

  if (!crashedThread) {
    log(`No thread found with ID '${crashedThreadId}'`);
    return;
  }

  await sendAbnormalSession(crashedThread.state?.session);

  log('Sending event');

  const event: Event = {
    event_id: uuid4(),
    contexts,
    release,
    environment,
    dist,
    platform: 'node',
    level: 'error',
    tags,
    ...getExceptionAndThreads(crashedThreadId, threads),
  };

  const allDebugImages: Record<string, string> = Object.values(threads).reduce((acc, threadState) => {
    return { ...acc, ...threadState.state?.debugImages };
  }, {});

  applyDebugMeta(event, allDebugImages);

  const envelope = createEventEnvelope(event, dsn, sdkMetadata, tunnel);
  // Log the envelope to aid in testing
  log(JSON.stringify(envelope));

  await transport.send(envelope);
  await transport.flush(2000);

  if (sentAnrEvents >= maxBlockedEvents) {
    // Delay for 5 seconds so that stdio can flush if the main event loop ever restarts.
    // This is mainly for the benefit of logging or debugging.
    setTimeout(() => {
      process.exit(0);
    }, 5_000);
  }
}

setInterval(async () => {
  for (const [threadId, time] of Object.entries(getThreadsLastSeen())) {
    if (time > threshold) {
      if (triggeredThreads.has(threadId)) {
        continue;
      }

      log(`Detected ANR for thread '${threadId}' with last seen time ${time} ms`);
      triggeredThreads.add(threadId);

      await sendAnrEvent(threadId);
    } else {
      triggeredThreads.delete(threadId);
    }
  }
}, pollInterval);
