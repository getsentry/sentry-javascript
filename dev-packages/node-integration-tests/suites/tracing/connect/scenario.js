const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

const port = 5986;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

const connect = require('connect');
const http = require('http');

const run = async () => {
  const app = connect();

  app.use('/', function (req, res, next) {
    res.end('Hello World');
    next();
  });

  app.use('/error', function () {
    throw new Error('Sentry Test Error');
  });

  Sentry.setupConnectErrorHandler(app);

  const server = http.createServer(app);

  server.listen(port);

  sendPortToRunner(port);
};

run();
