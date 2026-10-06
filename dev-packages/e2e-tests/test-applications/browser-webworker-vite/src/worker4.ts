import * as Sentry from '@sentry/browser';

Sentry.registerWebWorker({ self });

// Thrown while the worker script first runs, before the page's acknowledgement can arrive
throw new Error('Uncaught error during worker startup');
