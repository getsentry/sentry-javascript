import { handleCallbackErrors } from '@sentry/core';
import { logger } from '@sentry/utils';
import { Worker } from 'worker_threads';

const base64WorkerScript = '###TimeTravelWorkerScript###';

export interface Step {
  filename?: string;
  lineno?: number;
  colno?: number;
  pre_lines?: string[];
  line?: string;
  post_lines?: string[];
}

export interface PayloadEvent {
  type: 'Payload';
  steps: Step[];
}

export type WorkerThreadMessage = PayloadEvent;

interface StopEvent {
  type: 'stop';
}

export type ParentThreadMessage = StopEvent;

/**
 * Allows you to go back in time when an error happens within the callback you provide.
 *
 * @experimental
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withTimetravel<F extends () => any>(timetravelableFunction: F): Promise<ReturnType<F>> {
  // We load inspector dynamically because on some platforms Node is built without inspector support
  const inspector = await import('node:inspector');

  if (!inspector.url()) {
    inspector.open(0);
  }

  const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
    // We don't want any Node args to be passed to the worker
    execArgv: [],
  });

  worker.on('exit', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
  });

  worker.on('error', (err: Error) => {
    logger.error('Timetravel worker error', err);
  });

  // Ensure this thread can't block app exit
  worker.unref();

  inspector.waitForDebugger();

  return handleCallbackErrors(
    () => timetravelableFunction(),
    () => {
      // noop? or write stack traces on error object
    },
    () => {
      function onStopMessage(message: WorkerThreadMessage): void {
        if (message.type === 'Payload') {
          // Do stuff with steps
          // console.log(JSON.stringify(message.steps));
        }

        worker.off('message', onStopMessage);
      }

      worker.on('message', onStopMessage);

      worker.postMessage({ type: 'stop' });
    },
  );
}
