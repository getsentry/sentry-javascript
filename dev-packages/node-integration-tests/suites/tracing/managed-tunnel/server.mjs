import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import http from 'http';

const server = http.createServer((_request, response) => {
  response.end('app');
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
