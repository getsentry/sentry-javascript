const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../utils/setupOtel.js');

function configureSentry() {
  const client = Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    debug: true,
    integrations: [Sentry.anrIntegration({ captureStackTrace: true })],
  });
  setupOtel(client);
}

async function main() {
  configureSentry();
  await new Promise(resolve => setTimeout(resolve, 1000));
}

main();
