import * as Sentry from '@sentry/browser';

Sentry.registerWebWorker({ self });

// Let the main thread know the worker is ready
self.postMessage({
  msg: 'WORKER_2_READY',
});

self.addEventListener('message', event => {
  if (event.data.msg === 'TRIGGER_ERROR') {
    // This will throw an uncaught error in the worker
    throw new Error(`Uncaught error in worker 2`);
  }
});
