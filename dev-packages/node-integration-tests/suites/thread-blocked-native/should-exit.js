const Sentry = require('@sentry/node');
const { threadBlockedIntegration } = require('@sentry/node-native');

function configureSentry() {
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    debug: true,
    integrations: [threadBlockedIntegration()],
  });
}

async function main() {
  configureSentry();
  await new Promise(resolve => setTimeout(resolve, 1000));
}

main();
