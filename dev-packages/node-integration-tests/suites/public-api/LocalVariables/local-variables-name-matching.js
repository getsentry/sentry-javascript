const Sentry = require('@sentry/node');
const { loggingTransport } = require('@sentry-internal/node-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  includeLocalVariables: true,
  transport: loggingTransport,
});

process.on('uncaughtException', () => {
  // do nothing - this will prevent the Error below from closing this process
});

// Testing GraphQL resolver: https://github.com/getsentry/sentry-javascript/issues/16701
const resolvers = {
  Query: {
    testSentry: args => {
      try {
        args.foo.map(x => x);
        return true;
      } catch (error) {
        Sentry.captureException(error);
        return false;
      }
    },
  },
};

function regularFunction() {
  resolvers.Query.testSentry({ foo: undefined });
}

setTimeout(() => {
  regularFunction();
}, 1000);
