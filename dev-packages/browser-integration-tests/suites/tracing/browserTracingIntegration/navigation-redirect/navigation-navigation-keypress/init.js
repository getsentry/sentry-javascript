import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
  debug: true,
});

document.getElementById('btn1').addEventListener('click', () => {
  // Trigger navigation later than click, so the last click is more than 300ms ago
  setTimeout(() => {
    window.history.pushState({}, '', '/sub-page');

    // then trigger redirect inside of this navigation, which should be detected as a redirect
    // because the last click was more than 300ms ago
    setTimeout(() => {
      window.history.pushState({}, '', '/sub-page-redirect');
    }, 100);
  }, 400);
});

document.getElementById('btn2').addEventListener('click', () => {
  // Trigger navigation later than click, so the last click is more than 300ms ago
  setTimeout(() => {
    window.history.pushState({}, '', '/sub-page-2');
  }, 400);
});
