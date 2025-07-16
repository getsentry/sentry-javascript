import * as Sentry from '@sentry/browser';

// Initialize Sentry with webWorker integration
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  debug: true,
  beforeSend(event) {
    console.log('xx beforeSend', JSON.stringify(event.exception.values[0].stacktrace.frames, null, 2));
    return event;
  },
});

const worker = new Worker('/worker.js');

worker.addEventListener('message', event => {
  console.log('xx message', event);
});

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

const btn = document.getElementById('errWorker');

btn.addEventListener('click', () => {
  worker.postMessage({
    type: 'throw-error',
  });
});
