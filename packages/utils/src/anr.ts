import type { StackFrame } from '@sentry/types';

import { dropUndefinedKeys } from './object';
import { filenameIsInApp } from './stacktrace';

type WatchdogReturn = {
  /** Resets the watchdog timer */
  poll: () => void;
  /** Enables or disables the watchdog timer */
  enabled: (state: boolean) => void;
};

type CreateTimerImpl = () => { getTimeMs: () => number; reset: () => void };

/**
 * A node.js watchdog timer
 * @param pollInterval The interval that we expect to get polled at
 * @param anrThreshold The threshold for when we consider ANR
 * @param callback The callback to call for ANR
 * @returns An object with `poll` and `enabled` functions {@link WatchdogReturn}
 */
export function watchdogTimer(
  createTimer: CreateTimerImpl,
  pollInterval: number,
  anrThreshold: number,
  callback: () => void,
): WatchdogReturn {
  const timer = createTimer();
  let triggered = false;
  let enabled = true;

  setInterval(() => {
    const diffMs = timer.getTimeMs();

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
      timer.reset();
    },
    enabled: (state: boolean) => {
      enabled = state;
    },
  };
}

// types copied from inspector.d.ts
interface Location {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

interface CallFrame {
  functionName: string;
  location: Location;
  url: string;
}

interface ScriptParsedEventDataType {
  scriptId: string;
  url: string;
}

interface PausedEventDataType {
  callFrames: CallFrame[];
  reason: string;
}

/**
 * Converts Debugger.CallFrame to Sentry StackFrame
 */
export function callFrameToStackFrame(
  frame: CallFrame,
  url: string | undefined,
  getModuleFromFilename: (filename: string | undefined) => string | undefined,
): StackFrame {
  const filename = url ? url.replace(/^file:\/\//, '') : undefined;

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
