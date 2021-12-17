import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window.events = [];

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  beforeSend: event => {
    window.events.push(event);
  },
});
