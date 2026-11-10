import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

const server = http.createServer((request, response) => {
  if (!Sentry.handleTunnelRequestIfMatched(request, response)) {
    response.end('app');
  }
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
