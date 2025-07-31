import * as Sentry from '@sentry/browser';

// Initialize Sentry with webWorker integration
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

const worker = new Worker('/worker.js');

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

const btn = document.getElementById('errWorker');

btn.addEventListener('click', () => {
  worker.postMessage({
    type: 'throw-error',
  });
});
