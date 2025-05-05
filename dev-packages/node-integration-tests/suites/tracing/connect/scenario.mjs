import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import connect from 'connect';
import http from 'http';

const port = 5986;

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
