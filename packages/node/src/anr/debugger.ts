import type { StackFrame } from '@sentry/types';
import { dropUndefinedKeys, filenameIsInApp } from '@sentry/utils';
import type { Debugger } from 'inspector';

import { getModuleFromFilename } from '../module';
import { createWebSocketClient } from './websocket';

/**
 * Converts Debugger.CallFrame to Sentry StackFrame
 */
function callFrameToStackFrame(
  frame: Debugger.CallFrame,
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
 * Wraps a websocket connection with the basic logic of the Node debugger protocol.
 * @param url The URL to connect to
 * @param onMessage A callback that will be called with each return message from the debugger
 * @returns A function that can be used to send commands to the debugger
 */
async function webSocketDebugger(
  url: string,
  onMessage: (message: DebugMessage) => void,
): Promise<(method: string, params?: unknown) => void> {
  let id = 0;
  const webSocket = await createWebSocketClient(url);

  webSocket.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString()) as DebugMessage;
    onMessage(message);
  });

  return (method: string, params?: unknown) => {
    webSocket.send(JSON.stringify({ id: id++, method, params }));
  };
}

/**
 * Captures stack traces from the Node debugger.
 * @param url The URL to connect to
 * @param callback A callback that will be called with the stack frames
 * @returns A function that triggers the debugger to pause and capture a stack trace
 */
export async function captureStackTrace(url: string, callback: (frames: StackFrame[]) => void): Promise<() => void> {
  // Collect scriptId -> url map so we can look up the filenames later
  const scripts = new Map<string, string>();

  const sendCommand = await webSocketDebugger(url, message => {
    if (message.method === 'Debugger.scriptParsed') {
      scripts.set(message.params.scriptId, message.params.url);
    } else if (message.method === 'Debugger.paused') {
      // copy the frames
      const callFrames = [...message.params.callFrames];
      // and resume immediately!
      sendCommand('Debugger.resume');
      sendCommand('Debugger.disable');

      const frames = callFrames
        .map(frame => callFrameToStackFrame(frame, id => scripts.get(id)))
        // Sentry expects the frames to be in the opposite order
        .reverse();

      callback(frames);
    }
  });

  return () => {
    sendCommand('Debugger.enable');
    sendCommand('Debugger.pause');
  };
}
