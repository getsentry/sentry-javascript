import inspector from 'inspector';
import { parentPort } from 'worker_threads';
import type { ParentThreadMessage } from './with-timetravel';

const session = new inspector.Session();

const parsedScripts = new Map<
  string, // scriptId
  { url?: string }
>();

const steps: unknown[] = [];

async function onPaused(
  pausedEvent: inspector.InspectorNotification<inspector.Debugger.PausedEventDataType>,
): Promise<void> {
  const script = parsedScripts.get(pausedEvent.params.callFrames[0]?.location.scriptId ?? 'invariant');

  if (script) {
    steps.push({
      filename: script.url,
      lineno: pausedEvent.params.callFrames[0]?.location.lineNumber,
      colno: pausedEvent.params.callFrames[0]?.location.columnNumber,
    });
  }

  session.post('Debugger.stepInto');
}

function onScriptParsed(
  scriptParsedMessage: inspector.InspectorNotification<inspector.Debugger.ScriptParsedEventDataType>,
): void {
  const { scriptId, url } = scriptParsedMessage.params;

  if (!url.startsWith('node:')) {
    parsedScripts.set(scriptId, { url });
  }
}

parentPort?.on('message', (message: ParentThreadMessage) => {
  if (message.type === 'stop') {
    session.off('Debugger.paused', onPaused);
    session.off('Debugger.scriptParsed', onScriptParsed);
    session.post('Debugger.resume');
    parentPort?.postMessage({ type: 'Payload', steps });
    session.disconnect();
  }
});

session.on('Debugger.scriptParsed', onScriptParsed);

session.connectToMainThread();

session.post('Debugger.enable', () => {
  session.on('Debugger.paused', onPaused);
  session.post('Debugger.pause', () => {
    session.post('Runtime.runIfWaitingForDebugger');
  });
});
