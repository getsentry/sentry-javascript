import { handleCallbackErrors } from '@sentry/core';
import { logger } from '@sentry/utils';
import { Worker } from 'worker_threads';

const base64WorkerScript = '###TimeTravelWorkerScript###';

/**
 * Allows you to go back in time when an error happens within the callback you provide.
 *
 * @experimental
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTimetravel<F extends () => any>(timetravelableFunction: F): ReturnType<F> {
  const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
    // We don't want any Node args to be passed to the worker
    execArgv: [],
  });

  process.on('exit', () => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    worker.terminate();
  });

  worker.on('message', () => {
    // do shit here
  });

  worker.once('error', (err: Error) => {
    logger.error('Timetravel worker error', err);
  });

  // Ensure this thread can't block app exit
  worker.unref();

  return handleCallbackErrors(
    () => timetravelableFunction(),
    () => {
      // noop?
    },
    () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      worker.terminate();
    },
  );
}
