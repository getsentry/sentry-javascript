import './style.css';
import MyWorker from './worker.ts?worker';
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: import.meta.env.E2E_TEST_DSN,
  environment: import.meta.env.MODE || 'development',
  tracesSampleRate: 1.0,
  debug: true,
  integrations: [Sentry.browserTracingIntegration()],
});

const worker = new MyWorker();

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

worker.addEventListener('message', event => {
  // this is part of the test, do not delete
  console.log('xx received message from worker', event);
});

document.querySelector<HTMLButtonElement>('#trigger-error')!.addEventListener('click', () => {
  worker.postMessage({
    type: 'TRIGGER_ERROR',
    data: 'This message triggers an uncaught error!',
  });
});
