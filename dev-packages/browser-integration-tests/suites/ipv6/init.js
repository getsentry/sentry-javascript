import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@[2001:db8::1]/1337',
  sendClientReports: false,
  defaultIntegrations: false,
});
