import * as Sentry from '@sentry/browser';

// type cast necessary because TS thinks this file is part of the main
// thread where self is of type `Window` instead of `Worker`
Sentry.registerWebWorker({ self: self as unknown as Worker });

// Let the main thread know the worker is ready
self.postMessage({
  msg: 'WORKER_READY',
});

self.addEventListener('message', event => {
  if (event.data.msg === 'TRIGGER_ERROR') {
    // This will throw an uncaught error in the worker
    throw new Error(`Uncaught error in worker`);
  }
});
