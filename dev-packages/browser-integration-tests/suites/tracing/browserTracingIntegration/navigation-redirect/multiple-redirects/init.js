import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});

window.history.pushState({}, '', '/sub-page-redirect-1');

setTimeout(() => {
  window.history.pushState({}, '', '/sub-page-redirect-2');
}, 400);

setTimeout(() => {
  window.history.pushState({}, '', '/sub-page-redirect-3');
}, 800);

document.getElementById('btn1').addEventListener('click', () => {
  window.history.pushState({}, '', '/next-page');
});

setTimeout(() => {
  document.getElementById('btn1').click();
  // 1s is still within the 1.5s time window, but the click should trigger a new navigation root span
}, 1000);

setTimeout(() => {
  window.history.pushState({}, '', '/next-page-redirect-1');
}, 1100);

setTimeout(() => {
  window.history.pushState({}, '', '/next-page-redirect-2');
}, 2000);
