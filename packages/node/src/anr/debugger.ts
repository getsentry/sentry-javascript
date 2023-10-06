import type { StackFrame } from '@sentry/types';
import type { Debugger } from 'inspector';
import { createDebugPauseMessageHandler } from '@sentry/utils';

import { getModuleFromFilename } from '../module';
import { createWebSocketClient } from './websocket';

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
): Promise<(method: string) => void> {
  let id = 0;
  const webSocket = await createWebSocketClient(url);

  webSocket.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString()) as DebugMessage;
    onMessage(message);
  });

  return (method: string) => {
    webSocket.send(JSON.stringify({ id: id++, method }));
  };
}

/**
 * Captures stack traces from the Node debugger.
 * @param url The URL to connect to
 * @param callback A callback that will be called with the stack frames
 * @returns A function that triggers the debugger to pause and capture a stack trace
 */
export async function captureStackTrace(url: string, callback: (frames: StackFrame[]) => void): Promise<() => void> {
  const sendCommand: (method: string) => void = await webSocketDebugger(
    url,
    createDebugPauseMessageHandler(cmd => sendCommand(cmd), getModuleFromFilename, callback),
  );

  return () => {
    sendCommand('Debugger.enable');
    sendCommand('Debugger.pause');
  };
}
