const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

Promise.reject(new Error('test rejection'));
