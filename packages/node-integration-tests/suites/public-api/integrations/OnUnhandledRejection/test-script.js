const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: integrations => {
    return integrations.map(integration => {
      if (integration.name === 'OnUnhandledRejection') {
        return new Sentry.Integrations.OnUnhandledRejection({
          mode: process.env['PROMISE_REJECTION_MODE'],
        });
      } else {
        return integration;
      }
    });
  },
});

if (process.env['ATTACH_ADDITIONAL_HANDLER']) {
  process.on('uncaughtException', () => {
    // do nothing - this will prevent the rejected promise below from closing this process before the timeout resolves
  });
}

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

Promise.reject();
