import { handleCallbackErrors } from '@sentry/core';
import { logger } from '@sentry/utils';
import { Worker } from 'worker_threads';
import { AsyncLocalStorage } from 'async_hooks';

export const timetravelALS = new AsyncLocalStorage<Worker>();

const base64WorkerScript = '###TimeTravelWorkerScript###';

export interface Variable {
  name?: string;
  value?: any;
}

export interface Step {
  filename?: string;
  lineno?: number;
  colno?: number;
  pre_lines?: string[];
  line?: string;
  post_lines?: string[];
  vars?: Variable[];
}

export interface PayloadEvent {
  type: 'Payload';
  steps: Step[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug?: any;
}

export type WorkerThreadMessage = PayloadEvent;

interface IncrRefCountEvent {
  type: 'incrRefCount';
}

interface DecrRefCountEvent {
  type: 'decRefCount';
}

interface RequestDataEvent {
  type: 'requestPayload';
}

interface WaitingEvent {
  type: 'waiting';
}

export type ParentThreadMessage = IncrRefCountEvent | DecrRefCountEvent | RequestDataEvent | WaitingEvent;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let inspector: any;

/**
 * Allows you to go back in time when an error happens within the callback you provide.
 *
 * @experimental
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withTimetravel<F extends () => any>(timetravelableFunction: F): Promise<ReturnType<F>> {
  if (!inspector) {
    // We load inspector dynamically because on some platforms Node is built without inspector support
    inspector = await import('inspector');
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!inspector.url()) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    inspector.open(0);
  }

  const worker =
    timetravelALS.getStore() ??
    (() => {
      const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
        // We don't want any Node args to be passed to the worker
        execArgv: [],
      });

      worker.on('error', (err: Error) => {
        logger.error('Timetravel worker error', err);
      });

      // Ensure this thread can't block app exit
      worker.unref();

      return worker;
    })();

  return timetravelALS.run(worker, () => {
    return handleCallbackErrors(
      () => {
        worker.postMessage({ type: 'incrRefCount' } as IncrRefCountEvent);
        worker.postMessage({ type: 'waiting' });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        inspector.waitForDebugger();
        return timetravelableFunction();
      },
      () => {
        // noop? or write stack traces on error object
      },
      () => {
        function onStopMessage(message: WorkerThreadMessage): void {
          if (message.type === 'Payload') {
            // Do stuff with steps
            // console.log(JSON.stringify(message));
          }

          worker.off('message', onStopMessage);
        }

        worker.on('message', onStopMessage);

        worker.postMessage({ type: 'decRefCount' } as DecrRefCountEvent);
      },
    );
  });
}
