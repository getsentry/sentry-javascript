import * as Sentry from '@sentry/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

const server = http.createServer((request, response) => {
  // Middleware that tags the request's user, run here on the tunnel request the app answers itself.
  if (request.method === 'POST') {
    Sentry.setUser({ id: 'tunnel-user' });
    response.end('app');
    return;
  }

  Sentry.captureException(new Error('after tunnel'));
  response.end('app');
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
