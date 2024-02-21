const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process before the timeout resolves
});

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

throw new Error();
