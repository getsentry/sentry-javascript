import MyWorker from './worker.ts?worker';
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: import.meta.env.MODE || 'development',
  tracesSampleRate: 1.0,
  debug: true,
  integrations: [Sentry.browserTracingIntegration()],
  tunnel: 'http://localhost:3031/', // proxy server
});

const worker = new MyWorker();

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

worker.addEventListener('message', event => {
  // this is part of the test, do not delete
  console.log('received message from worker:', event.data.msg);
});

document.querySelector<HTMLButtonElement>('#trigger-error')!.addEventListener('click', () => {
  worker.postMessage({
    msg: 'TRIGGER_ERROR',
  });
});
