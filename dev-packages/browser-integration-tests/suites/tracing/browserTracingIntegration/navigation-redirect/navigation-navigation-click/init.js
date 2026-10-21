import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
  debug: true,
});

document.getElementById('btn1').addEventListener('click', () => {
  window.history.pushState({}, '', '/sub-page');

  // then trigger redirect inside of this navigation, which should not be detected as a redirect
  // because the last click was less than 1.5s ago
  setTimeout(() => {
    document.getElementById('btn2').click();
  }, 100);
});

document.getElementById('btn2').addEventListener('click', () => {
  setTimeout(() => {
    // navigation happens ~1100ms after the last navigation
    window.history.pushState({}, '', '/sub-page-2');
  }, 1000);
});
