import inspector from 'inspector';
import { parentPort } from 'worker_threads';
import type { ParentThreadMessage, StateUpdateEvent } from './with-timetravel';

const session = new inspector.Session();

let isStopped = false;

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
          const callFrames = message.params.callFrames;
          parentPort?.postMessage({
            type: 'StateUpdateEvent',
            // @ts-expect-error fuck you
            data: { callFrames, scriptSource: scriptSourceMessage.scriptSource || '' },
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
