import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '0.1',
  initialScope: {
    user: {
      id: '1337',
      email: 'user@name.com',
      username: 'user1337',
    },
  },
});
