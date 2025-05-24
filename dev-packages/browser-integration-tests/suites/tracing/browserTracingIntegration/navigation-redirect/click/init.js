import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
  debug: true,
});

document.getElementById('btn1').addEventListener('click', () => {
  // trigger redirect immediately
  window.history.pushState({}, '', '/sub-page');
});

// Now trigger click, whic should trigger navigation
document.getElementById('btn1').click();
