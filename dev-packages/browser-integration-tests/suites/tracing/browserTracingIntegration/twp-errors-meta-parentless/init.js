import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: integrations => {
    integrations.push(Sentry.browserTracingIntegration({ _experiments: { parentlessRootSpans: true } }));
    return integrations.filter(i => i.name !== 'BrowserSession');
  },
  tracesSampleRate: 0,
});
