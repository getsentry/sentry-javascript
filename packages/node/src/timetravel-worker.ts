import inspector from 'inspector';
import { parentPort } from 'worker_threads';
import type { ParentThreadMessage, PayloadEvent, Step } from './with-timetravel';

const CONTEXT_LINZE_WINDOW_SIZE = 3;

const session = new inspector.Session();

const parsedScripts = new Map<
  string, // scriptId
  { url?: string }
>();

const steps: Step[] = [];

async function onPaused(
  pausedEvent: inspector.InspectorNotification<inspector.Debugger.PausedEventDataType>,
): Promise<void> {
  const topCallframe = pausedEvent.params.callFrames[0];
  if (topCallframe) {
    const parsedScript = parsedScripts.get(topCallframe.location.scriptId);
    if (parsedScript) {
      session.post(
        'Debugger.getScriptSource',
        { scriptId: topCallframe.location.scriptId },
        (err, scriptSourceMessage): void => {
          const scriptSource: string = scriptSourceMessage.scriptSource || '';
          const lines = scriptSource.split('\n');

          steps.push({
            filename: parsedScript.url,
            lineno: topCallframe.location.lineNumber,
            colno: topCallframe.location.columnNumber,
            pre_lines: lines.slice(
              Math.max(0, topCallframe.location.lineNumber - CONTEXT_LINZE_WINDOW_SIZE),
              topCallframe.location.lineNumber,
            ),
            line: lines[topCallframe.location.lineNumber] || '',
            post_lines: lines.slice(
              topCallframe.location.lineNumber + 1,
              topCallframe.location.lineNumber + 1 + CONTEXT_LINZE_WINDOW_SIZE,
            ),
          });
        },
      );
    }
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
    parentPort?.postMessage({ type: 'Payload', steps } satisfies PayloadEvent);
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
