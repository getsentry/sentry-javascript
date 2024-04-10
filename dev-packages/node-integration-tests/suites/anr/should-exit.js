const Sentry = require('@sentry/node');

function configureSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: '1.0',
    autoSessionTracking: false,
    debug: true,
    integrations: [Sentry.anrIntegration()],
  });
}

async function main() {
  configureSentry();
  await new Promise(resolve => setTimeout(resolve, 1000));
}

main();
