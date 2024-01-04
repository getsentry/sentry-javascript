const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: integrations => {
    return integrations.map(integration => {
      if (integration.name === 'OnUncaughtException') {
        return new Sentry.Integrations.OnUncaughtException({
          exitEvenIfOtherHandlersAreRegistered: false,
        });
      } else {
        return integration;
      }
    });
  },
});

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process before the timeout resolves
});

setTimeout(() => {
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

throw new Error();
