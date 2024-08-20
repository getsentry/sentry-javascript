import inspector from 'inspector';
import { parentPort } from 'worker_threads';
import type { ParentThreadMessage, PayloadEvent, Step, Variable } from './with-timetravel';

let refCount = 0;

const CONTEXT_LINZE_WINDOW_SIZE = 3;

const session = new inspector.Session();

const allowedScriptIds = new Set<string>();
const parsedScripts = new Map<
  string, // scriptId
  { url?: string }
>();
let nextFrameIsAllowed = false;

const steps: Step[] = [];
let vars: Variable[] = [];

function collectVariablesFromRuntime(objectId: undefined | string): void {
  if (!objectId) return;

  session.post('Runtime.getProperties',
    {
      objectId,
      ownProperties: true,
    },
    (err, params) => {
      for (const param of params.result) {
        const name = param.name;
        const value = param.value?.value;

        if (value) {
          vars.push({ name, value } satisfies Variable);
        }
      }
    }
  );
}

function extractDataAndSendToMainThread(topCallframe: inspector.Debugger.CallFrame, parsedScript: { url?: string }): void {
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
        vars: vars,
      });

      vars = [] as Variable[];
    },
  );
}

async function onPaused(
  pausedEvent: inspector.InspectorNotification<inspector.Debugger.PausedEventDataType>,
): Promise<void> {
  const topCallFrame = pausedEvent.params.callFrames[0];
  if (!topCallFrame) {
    return;
  }

  const parsedScript = parsedScripts.get(topCallFrame.location.scriptId);
  if (!parsedScript) {
    return;
  }

  if (nextFrameIsAllowed) {
    allowedScriptIds.add(topCallFrame.location.scriptId);
    nextFrameIsAllowed = false;
  }

  if (allowedScriptIds.has(topCallFrame.location.scriptId)) {
    const objectId = topCallFrame?.scopeChain[0]?.object.objectId;
    collectVariablesFromRuntime(objectId);
    extractDataAndSendToMainThread(topCallFrame, parsedScript);
  }

  session.post('Debugger.stepOver');
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
  if (message.type === 'incrRefCount') {
    refCount++;
  }

  if (message.type === 'decRefCount') {
    refCount--;
    if (refCount === 0) {
      session.off('Debugger.paused', onPaused);
      session.off('Debugger.scriptParsed', onScriptParsed);
      session.post('Debugger.resume');
      parentPort?.postMessage({
        type: 'Payload',
        steps,
      } satisfies PayloadEvent);
      session.disconnect();
    }
  }

  if (message.type === 'requestPayload') {
    parentPort?.postMessage({
      type: 'Payload',
      steps,
    } satisfies PayloadEvent);
  }

  if (message.type === 'waiting') {
    nextFrameIsAllowed = true;
    session.post('Debugger.pause');
    session.post('Runtime.runIfWaitingForDebugger');
  }
});

session.on('Debugger.scriptParsed', onScriptParsed);

session.connectToMainThread();

session.post('Debugger.enable', () => {
  session.on('Debugger.paused', onPaused);
});
