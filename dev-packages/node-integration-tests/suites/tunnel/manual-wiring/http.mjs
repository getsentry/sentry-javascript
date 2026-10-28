import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

Sentry.init({ dsn: process.env.SENTRY_DSN });

const server = http.createServer((request, response) => {
  if (request.url === '/dsn') {
    response.end(process.env.SENTRY_DSN);
    return;
  }

  // The test's last request, so the runner only stops the scenario after every check.
  if (request.url === '/done') {
    Sentry.captureMessage('done');
    response.end('ok');
    return;
  }

  if (!Sentry.handleTunnelRequestIfMatched(request, response)) {
    response.end('app');
  }
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
