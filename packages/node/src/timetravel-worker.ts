import inspector from 'inspector';
import { parentPort } from 'worker_threads';
import type { ParentThreadMessage, StateUpdateEvent } from './with-timetravel';

const session = new inspector.Session();

let isStopped = false;

const window = 3;

parentPort?.on('message', (message: ParentThreadMessage) => {
  if (message.type === 'stop') {
    isStopped = true;
  }
});

session.connectToMainThread();

session.post('Debugger.enable', () => {
  session.on('Debugger.paused', message => {
    session.post(
      'Debugger.getScriptSource',
      { scriptId: message.params.callFrames[0]?.location.scriptId },
      (err, scriptSourceMessage) => {
        if (!isStopped) {
          const topCallFrame = message.params.callFrames[0];
          // @ts-expect-error fuck you
          const scriptSource: string = scriptSourceMessage.scriptSource || '';
          const lines = scriptSource.split('\n');

          parentPort?.postMessage({
            type: 'StateUpdateEvent',
            data: {
              filename: topCallFrame?.url || 'unknown',
              lineno: topCallFrame?.functionLocation?.lineNumber || 0,
              colno: topCallFrame?.functionLocation?.columnNumber || 0,
              pre_lines: lines.slice(Math.max(0, (topCallFrame?.functionLocation?.lineNumber || 0) - window), topCallFrame?.functionLocation?.lineNumber || 0),
              line: lines[topCallFrame?.functionLocation?.lineNumber || 0] || '',
              post_lines: lines.slice((topCallFrame?.functionLocation?.lineNumber || 0) + 1, (topCallFrame?.functionLocation?.lineNumber || 0) + 1 + window),
            },
          } satisfies StateUpdateEvent);
        }
        session.post('Debugger.stepInto');
      },
    );
  });

  session.post('Debugger.pause', () => {
    session.post('Runtime.runIfWaitingForDebugger');
  });
});

// DO NOT DELETE - idk why but don't
setInterval(() => {
  // Stop the worker from exiting
}, 10_000);
