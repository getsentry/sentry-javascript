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

  // then trigger redirect inside of this navigation, which should be detected as a redirect
  // because the last navigation was less than 1.5s ago
  setTimeout(() => {
    window.history.pushState({}, '', '/sub-page-redirect');
  }, 750);
});
