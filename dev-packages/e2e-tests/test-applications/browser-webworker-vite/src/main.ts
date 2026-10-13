import MyWorker from './worker.ts?worker';
import MyWorker2 from './worker2.ts?worker';
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: import.meta.env.MODE || 'development',
  tracesSampleRate: 1.0,
  debug: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.thirdPartyErrorFilterIntegration({
      behaviour: 'apply-tag-if-contains-third-party-frames',
      filterKeys: ['browser-webworker-vite'],
    }),
  ],
  tunnel: 'http://localhost:3031/', // proxy server
});

const worker = new MyWorker();
const worker2 = new MyWorker2();

const webWorkerIntegration = Sentry.webWorkerIntegration({ worker: [worker, worker2] });
Sentry.addIntegration(webWorkerIntegration);

worker.addEventListener('error', event => {
  // this is part of the test, do not delete
  (window as any).workerErrorEvents = [
    ...((window as any).workerErrorEvents ?? []),
    { message: event.message, hasError: !!event.error },
  ];
});

worker.addEventListener('message', event => {
  // this is part of the test, do not delete
  console.log('received message from worker:', event.data.msg);
});

document.querySelector<HTMLButtonElement>('#trigger-error')!.addEventListener('click', () => {
  worker.postMessage({
    msg: 'TRIGGER_ERROR',
  });
});

document.querySelector<HTMLButtonElement>('#trigger-primitive-error')!.addEventListener('click', () => {
  worker.postMessage({
    msg: 'TRIGGER_PRIMITIVE_ERROR',
  });
});

document.querySelector<HTMLButtonElement>('#trigger-error-2')!.addEventListener('click', () => {
  worker2.postMessage({
    msg: 'TRIGGER_ERROR',
  });
});

document.querySelector<HTMLButtonElement>('#trigger-startup-error')!.addEventListener('click', async () => {
  const Worker4 = await import('./worker4.ts?worker');
  webWorkerIntegration.addWorker(new Worker4.default());
});

document.querySelector<HTMLButtonElement>('#trigger-error-3')!.addEventListener('click', async () => {
  const Worker3 = await import('./worker3.ts?worker');
  const worker3 = new Worker3.default();
  webWorkerIntegration.addWorker(worker3);
  worker3.postMessage({
    msg: 'TRIGGER_ERROR',
  });
});
