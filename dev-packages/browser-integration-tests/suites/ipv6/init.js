import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@[2001:db8::1]/1337',
  sendClientReports: false,
  defaultIntegrations: false,
});
