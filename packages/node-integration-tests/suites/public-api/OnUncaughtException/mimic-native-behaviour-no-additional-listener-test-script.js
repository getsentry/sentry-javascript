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

setTimeout(() => {
  // This should not be called because the script throws before this resolves
  process.stdout.write("I'm alive!");
  process.exit(0);
}, 500);

throw new Error();
