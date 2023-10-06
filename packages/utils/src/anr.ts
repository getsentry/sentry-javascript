import { StackFrame } from '@sentry/types';
import type { Debugger } from 'inspector';
import { dropUndefinedKeys } from './object';
import { filenameIsInApp, stripSentryFramesAndReverse } from './stacktrace';

type WatchdogReturn = { poll: () => void; enabled: (state: boolean) => void };

/**
 * A node.js watchdog timer
 * @param pollInterval The interval that we expect to get polled at
 * @param anrThreshold The threshold for when we consider ANR
 * @param callback The callback to call for ANR
 * @returns A function to call to reset the timer
 */
export function watchdogTimer(pollInterval: number, anrThreshold: number, callback: () => void): WatchdogReturn {
  let lastPoll = process.hrtime();
  let triggered = false;
  let enabled = true;

  setInterval(() => {
    const [seconds, nanoSeconds] = process.hrtime(lastPoll);
    const diffMs = Math.floor(seconds * 1e3 + nanoSeconds / 1e6);

    if (triggered === false && diffMs > pollInterval + anrThreshold) {
      triggered = true;
      if (enabled) {
        callback();
      }
    }

    if (diffMs < pollInterval + anrThreshold) {
      triggered = false;
    }
  }, 20);

  return {
    poll: () => {
      lastPoll = process.hrtime();
    },
    enabled: (state: boolean) => {
      enabled = state;
    },
  };
}

/**
 * Converts Debugger.CallFrame to Sentry StackFrame
 */
function callFrameToStackFrame(
  frame: Debugger.CallFrame,
  getModuleFromFilename: (filename: string | undefined) => string | undefined,
  filenameFromScriptId: (id: string) => string | undefined,
): StackFrame {
  const filename = filenameFromScriptId(frame.location.scriptId)?.replace(/^file:\/\//, '');

  // CallFrame row/col are 0 based, whereas StackFrame are 1 based
  const colno = frame.location.columnNumber ? frame.location.columnNumber + 1 : undefined;
  const lineno = frame.location.lineNumber ? frame.location.lineNumber + 1 : undefined;

  return dropUndefinedKeys({
    filename,
    module: getModuleFromFilename(filename),
    function: frame.functionName || '?',
    colno,
    lineno,
    in_app: filename ? filenameIsInApp(filename) : undefined,
  });
}

// The only messages we care about
type DebugMessage =
  | {
      method: 'Debugger.scriptParsed';
      params: Debugger.ScriptParsedEventDataType;
    }
  | { method: 'Debugger.paused'; params: Debugger.PausedEventDataType };

/**
 * Creates a message handler from the v8 debugger protocol and passed stack frames to the callback when paused.
 */
export function createDebugPauseMessageHandler(
  sendCommand: (message: string) => void,
  getModuleFromFilename: (filename?: string) => string | undefined,
  pausedStackFrames: (frames: StackFrame[]) => void,
): (message: DebugMessage) => void {
  // Collect scriptId -> url map so we can look up the filenames later
  const scripts = new Map<string, string>();

  return message => {
    if (message.method === 'Debugger.scriptParsed') {
      scripts.set(message.params.scriptId, message.params.url);
    } else if (message.method === 'Debugger.paused') {
      // copy the frames
      const callFrames = [...message.params.callFrames];
      // and resume immediately
      sendCommand('Debugger.resume');
      sendCommand('Debugger.disable');

      const frames = stripSentryFramesAndReverse(
        callFrames.map(frame => callFrameToStackFrame(frame, getModuleFromFilename, id => scripts.get(id))),
      );

      pausedStackFrames(frames);
    }
  };
}
