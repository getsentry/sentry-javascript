import inspector from 'inspector';
import { parentPort } from 'worker_threads';
import type { ParentThreadMessage, PayloadEvent, Step } from './with-timetravel';

let refCount = 0;

const CONTEXT_LINZE_WINDOW_SIZE = 3;

const session = new inspector.Session();

const allowedScriptIds = new Set<string>();
const parsedScripts = new Map<
  string, // scriptId
  { url?: string }
>();
let nextFrameIsAllowed = false;

function unrollArray(objectId: string | undefined): Promise<unknown[]> {
  if (!objectId) return Promise.resolve([]);

  return new Promise(resolve => {
    session.post(
      'Runtime.getProperties',
      {
        objectId,
        ownProperties: true,
      },
      (err, params) => {
        const arrayProps = params.result
          .filter(v => v.name !== 'length' && !isNaN(parseInt(v.name, 10)))
          .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
          .map(v => v?.value?.value);

        resolve(arrayProps);
      },
    );
  });
}

function unrollObject(objectId: string | undefined): Promise<Record<string, unknown>> {
  if (!objectId) return Promise.resolve({});

  return new Promise(resolve => {
    session.post(
      'Runtime.getProperties',
      {
        objectId,
        ownProperties: true,
      },
      (err, params) => {
        const obj = params.result
          .map<[string, unknown]>(v => [v.name, v?.value?.value])
          .reduce((acc, [key, val]) => {
            acc[key] = val;
            return acc;
          }, {} as Record<string, unknown>);

        resolve(obj);
      },
    );
  });
}

const steps: Step[] = [];

async function collectVariablesFromCurrentFrame(objectId: undefined | string): Promise<{ [name: string]: unknown }> {
  if (!objectId) {
    return Promise.resolve({});
  }

  return new Promise(resolve => {
    session.post(
      'Runtime.getProperties',
      {
        objectId,
        ownProperties: true,
      },
      async (err, params) => {
        const vars: Record<string, unknown> = {};
        for (const param of params.result) {
          const name = param.name;
          const value = param.value;

          if (value?.type === 'object' && value.subtype === 'array') {
            vars[name] = await unrollArray(value.objectId);
          } else if (value?.type === 'object') {
            vars[name] = await unrollObject(value.objectId);
          } else { // numbers, strings
            vars[name] = value?.value;
          }
        }
        resolve(vars);
      },
    );
  });
}

async function getFileDataForCurrentFrame(
  topCallframe: inspector.Debugger.CallFrame,
  parsedScript: { url?: string },
): Promise<{
  filename?: string;
  lineno?: number;
  colno?: number;
  pre_lines?: string[];
  line?: string;
  post_lines?: string[];
}> {
  return new Promise(resolve => {
    session.post(
      'Debugger.getScriptSource',
      { scriptId: topCallframe.location.scriptId },
      (err, scriptSourceMessage): void => {
        const scriptSource: string = scriptSourceMessage.scriptSource || '';
        const lines = scriptSource.split('\n');

        resolve({
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
  });
}

async function onPaused(
  pausedEvent: inspector.InspectorNotification<inspector.Debugger.PausedEventDataType>,
): Promise<void> {
  const topCallFrame = pausedEvent.params.callFrames[0];
  if (topCallFrame) {
    const parsedScript = parsedScripts.get(topCallFrame.location.scriptId);
    if (parsedScript) {
      if (nextFrameIsAllowed) {
        allowedScriptIds.add(topCallFrame.location.scriptId);
        nextFrameIsAllowed = false;
      }

      if (allowedScriptIds.has(topCallFrame.location.scriptId)) {
        const objectId = topCallFrame.scopeChain[0]?.object.objectId;
        const [variablesForCurrentFrame, fileDataForCurrentFrame] = await Promise.all([
          collectVariablesFromCurrentFrame(objectId),
          getFileDataForCurrentFrame(topCallFrame, parsedScript),
        ]);

        steps.push({
          ...fileDataForCurrentFrame,
          vars: variablesForCurrentFrame,
        });
      }
    }
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
