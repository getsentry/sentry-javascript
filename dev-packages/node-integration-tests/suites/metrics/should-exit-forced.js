const Sentry = require('@sentry/node');

function configureSentry() {
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    autoSessionTracking: false,
  });

  Sentry.metrics.increment('test');
}

async function main() {
  configureSentry();
  await new Promise(resolve => setTimeout(resolve, 1000));
  process.exit(0);
}

main();
