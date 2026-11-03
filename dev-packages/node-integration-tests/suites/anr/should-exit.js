const Sentry = require('@sentry/node');

function configureSentry() {
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    debug: true,
    integrations: [Sentry.anrIntegration({ captureStackTrace: true })],
  });
}

async function main() {
  configureSentry();
  await new Promise(resolve => setTimeout(resolve, 1000));
}

main();
